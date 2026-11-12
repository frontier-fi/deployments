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

  constructor(chainId: number) {
    this.chainId = chainId;
  }

  async isChainSupported(): Promise<boolean> {
    const chains = (await (await fetch(`${SOURCIFY_SERVER}/chains`)).json()) as {
      chainId: number;
      supported: boolean;
    }[];
    return chains.some((chain) => chain.chainId === this.chainId && chain.supported);
  }

  contractUrl(address: string): string {
    return `https://repo.sourcify.dev/${this.chainId}/${address}`;
  }

  // Resolves to the match ('exact_match', 'match' or 'already verified'); throws when Sourcify cannot verify it.
  async verify(address: string, request: SourcifyRequest): Promise<string> {
    let lastError: SourcifyError | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const response = await fetch(`${SOURCIFY_SERVER}/v2/verify/${this.chainId}/${address}`, {
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
      const job = (await (await fetch(`${SOURCIFY_SERVER}/v2/verify/${verificationId}`)).json()) as Job;
      if (job.isJobCompleted) return job;
      if (Date.now() >= deadline) throw new Error(`Sourcify job ${verificationId} did not finish`);
      await sleep(JOB_POLL_MS);
    }
  }
}

function isTransient(error: SourcifyError): boolean {
  if (['internal_error', 'too_many_requests', '429', '500', '502', '503'].includes(error.customCode)) return true;
  return /not deployed|no bytecode|bytecode.*(empty|not found)|does not have code/i.test(error.message);
}
