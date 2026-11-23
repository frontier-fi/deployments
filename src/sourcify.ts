import { sleep } from '@nomicfoundation/hardhat-verify/internal/utilities';

// Sourcify's API v2. No key needed. https://sourcify.dev/server/api-docs/
const SOURCIFY_SERVER = 'https://sourcify.dev/server';
const JOB_POLL_MS = 3_000;
const JOB_TIMEOUT_MS = 180_000;
const MAX_ATTEMPTS = 4;
// Sourcify reads the bytecode from its own RPC, which can lag behind ours right after a deploy.
const RETRY_DELAY_MS = 15_000;

export type SourcifyRequest = {
  stdJsonInput: unknown;
  compilerVersion: string;
  contractIdentifier: string;
  creationTransactionHash?: string;
};

type SourcifyError = { customCode: string; message: string };
type Job = { isJobCompleted: boolean; contract?: { match: string | null }; error?: SourcifyError };

export default class Sourcify {
  chainId: number;
  server: string;
  private supported: Promise<boolean> | undefined;

  constructor(chainId: number, server = SOURCIFY_SERVER) {
    this.chainId = chainId;
    this.server = server;
  }

  // The server's host, to tell several Sourcify servers apart in the log.
  get name(): string {
    return new URL(this.server).host;
  }

  // Asked once per server; an unreachable server counts as not supporting the chain.
  isChainSupported(): Promise<boolean> {
    this.supported ??= fetch(`${this.server}/chains`)
      .then((response) => response.json() as Promise<{ chainId: number; supported: boolean }[]>)
      .then((chains) => chains.some((chain) => chain.chainId === this.chainId && chain.supported))
      .catch(() => false);
    return this.supported;
  }

  // Another server has no repository browser, so its link is the API's own lookup.
  contractUrl(address: string): string {
    if (this.server !== SOURCIFY_SERVER) return `${this.server}/v2/contract/${this.chainId}/${address}`;
    return `https://repo.sourcify.dev/${this.chainId}/${address}`;
  }

  // Resolves to the match ('exact_match', 'match' or 'already verified'); throws when Sourcify cannot verify it.
  async verify(address: string, request: SourcifyRequest): Promise<string> {
    let lastError: SourcifyError | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const response = await fetch(`${this.server}/v2/verify/${this.chainId}/${address}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });
      const body = (await response.json()) as { verificationId?: string } & Partial<SourcifyError>;

      if (response.status === 409) return 'already verified';
      if (response.status === 202 && body.verificationId) {
        const job = await this.waitForJob(body.verificationId);
        if (job.contract?.match) return job.contract.match;
        lastError = job.error;
      } else {
        lastError = { customCode: body.customCode ?? String(response.status), message: body.message ?? '' };
      }

      if (lastError === undefined || !isTransient(lastError)) break;
      await sleep(RETRY_DELAY_MS);
    }
    throw new Error(`Sourcify: ${lastError?.customCode}: ${lastError?.message}`);
  }

  private async waitForJob(verificationId: string): Promise<Job> {
    const deadline = Date.now() + JOB_TIMEOUT_MS;
    for (;;) {
      const job = (await (await fetch(`${this.server}/v2/verify/${verificationId}`)).json()) as Job;
      if (job.isJobCompleted) return job;
      if (Date.now() >= deadline) throw new Error(`Sourcify job ${verificationId} did not finish`);
      await sleep(JOB_POLL_MS);
    }
  }
}

// contract_not_deployed and cannot_fetch_bytecode mean Sourcify's RPC has not seen the contract yet.
const TRANSIENT_CODES = [
  'contract_not_deployed',
  'cannot_fetch_bytecode',
  'internal_error',
  'too_many_requests',
  '429',
  '500',
  '502',
  '503',
];

function isTransient(error: SourcifyError): boolean {
  return TRANSIENT_CODES.includes(error.customCode);
}
