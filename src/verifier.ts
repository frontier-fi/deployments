import { CompilerInput, HardhatRuntimeEnvironment, Libraries, Network } from 'hardhat/types';
import * as parser from '@solidity-parser/parser';
import { Etherscan } from '@nomicfoundation/hardhat-verify/etherscan';

import Task from './task';
import { findContractSourceName } from './buildinfo';
import { encodeArguments, sleep } from '@nomicfoundation/hardhat-verify/internal/utilities';
import {
  extractMatchingContractInformation,
  getLibraryInformation,
} from '@nomicfoundation/hardhat-verify/internal/solc/artifacts';
import { Bytecode } from '@nomicfoundation/hardhat-verify/internal/solc/bytecode';
import { ChainConfig } from '@nomicfoundation/hardhat-verify/types';
import logger from './logger';
import Sourcify from './sourcify';

const EXPLORER_BYTECODE_POLL_MS = 5_000;
// Etherscan's verify endpoint rejects a contract until its backend has indexed the bytecode.
const EXPLORER_BYTECODE_TIMEOUT_MS = 180_000;

// Deployed on every chain this repo targets, and verified on each explorer.
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

type PreparedVerification = {
  input: CompilerInput;
  contractName: string;
  solcLongVersion: string;
  constructorArguments: string;
};

type VerifierOptions = { dryRun?: boolean; sourcify?: boolean };

// The verifier yarn deploy, verify-contract and rehearse use. `network` names the chain to verify on, which in a
// rehearsal is the forked network rather than hre.network.
export async function createVerifier(
  hre: HardhatRuntimeEnvironment,
  network: string,
  apiKey: string,
  options: VerifierOptions = {}
): Promise<Verifier> {
  const chainConfig = await Etherscan.getCurrentChainConfig(
    network,
    hre.network.provider,
    hre.config.etherscan.customChains
  );
  return new Verifier(hre.network, apiKey, chainConfig, options);
}

export default class Verifier {
  etherscanInstance: Etherscan;
  network: Network;
  // Prepare each request (sources, bytecode match, constructor arguments) without submitting it.
  dryRun: boolean;
  dryRunFailures: string[] = [];
  // Second verifier, best effort. Etherscan decides whether verification succeeded.
  sourcify: Sourcify | undefined;
  private sourcifySupported: Promise<boolean> | undefined;

  // A single key selects Etherscan's v2 API, which serves every chain.
  constructor(
    _network: Network,
    _apiKey: string,
    _chainConfig: ChainConfig,
    { dryRun = false, sourcify = true }: VerifierOptions = {}
  ) {
    this.network = _network;
    this.dryRun = dryRun;

    this.etherscanInstance = Etherscan.fromChainConfig(_apiKey, _chainConfig);
    this.sourcify = sourcify ? new Sourcify(_chainConfig.chainId) : undefined;
  }

  // Calls every endpoint verification uses, with the configured key and chain, without verifying anything.
  // Returns one line per endpoint; throws if verification cannot work.
  async preflight(): Promise<string[]> {
    const report: string[] = [];

    const source = await this.get({ module: 'contract', action: 'getsourcecode', address: PERMIT2 });
    const sourceResult = Array.isArray(source.result) ? (source.result[0] as { SourceCode?: string }) : undefined;
    if (source.status !== '1' || !sourceResult?.SourceCode) {
      throw new Error(`getsourcecode failed: ${JSON.stringify(source.result)}`);
    }
    report.push('getsourcecode: ok');

    // An unknown guid is rejected after the key is accepted.
    const status = await this.get({ module: 'contract', action: 'checkverifystatus', guid: '0' });
    if (String(status.result).includes('API Key')) throw new Error(`checkverifystatus failed: ${status.result}`);
    report.push('checkverifystatus: ok');

    // Submitting for an address without code is rejected before anything is queued.
    const submit = await this.post({
      module: 'contract',
      action: 'verifysourcecode',
      contractaddress: '0x0000000000000000000000000000000000000001',
      codeformat: 'solidity-standard-json-input',
      contractname: 'Preflight.sol:Preflight',
      compilerversion: 'v0.8.26+commit.8a97fa7a',
      sourceCode: '{}',
    });
    if (!String(submit.result).includes('Unable to locate ContractCode')) {
      throw new Error(`verifysourcecode failed: ${submit.result}`);
    }
    report.push('verifysourcecode: ok');

    if (this.sourcify !== undefined) {
      report.push(
        (await this.isSourcifySupported())
          ? `sourcify: chain ${this.sourcify.chainId} supported`
          : `sourcify: chain ${this.sourcify.chainId} not supported, skipped`
      );
    }

    return report;
  }

  // Exact match leaves SimilarMatch empty. A similar match names the other contract.
  async verificationMatch(address: string): Promise<string | undefined> {
    const json = await this.get({ module: 'contract', action: 'getsourcecode', address });
    const result = Array.isArray(json.result)
      ? (json.result[0] as { SimilarMatch?: string; SourceCode?: string })
      : undefined;
    if (result === undefined) return undefined;

    const similar = result.SimilarMatch;
    if (typeof similar === 'string' && similar !== '') return `similar match of ${similar}`;
    if (result.SourceCode) return 'exact match';
    return undefined;
  }

  async call(
    task: Task,
    name: string,
    address: string,
    constructorArguments: string | unknown[],
    libraries: Libraries = {}
  ): Promise<string> {
    let prepared: PreparedVerification;
    try {
      prepared = await this.prepare(task, name, address, constructorArguments, libraries);
    } catch (error) {
      if (this.dryRun)
        this.dryRunFailures.push(`${name} at ${address}: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
    if (this.dryRun) return this.etherscanInstance.getContractUrl(address);

    // Before Etherscan, whose "already verified" ends the call.
    await this.verifyOnSourcify(name, address, prepared);
    return this.verifyOnEtherscan(address, prepared);
  }

  private async verifyOnEtherscan(address: string, prepared: PreparedVerification): Promise<string> {
    const { message: guid } = await this.submitToEtherscan(address, prepared);

    // The new guid is not always queryable at once. getVerificationStatus then polls while it is pending.
    await sleep(1000);
    const status = await this.etherscanInstance.getVerificationStatus(guid);
    if (status.isSuccess()) return this.etherscanInstance.getContractUrl(address);
    // Includes "Already Verified", which Task.verify reports as a notice.
    throw new Error(`The contract verification failed. Reason: ${status.message}`);
  }

  private async verifyOnSourcify(name: string, address: string, prepared: PreparedVerification): Promise<void> {
    if (this.sourcify === undefined || !(await this.isSourcifySupported())) return;
    try {
      const match = await this.sourcify.verify(address, {
        stdJsonInput: prepared.input,
        compilerVersion: prepared.solcLongVersion,
        contractIdentifier: prepared.contractName,
      });
      logger.success(`Sourcify: ${name} ${match.replace('_', ' ')} at ${this.sourcify.contractUrl(address)}`);
    } catch (error) {
      logger.warn(`Sourcify could not verify ${name} at ${address}: ${error instanceof Error ? error.message : error}`);
    }
  }

  private isSourcifySupported(): Promise<boolean> {
    if (this.sourcify === undefined) return Promise.resolve(false);
    this.sourcifySupported ??= this.sourcify.isChainSupported().catch(() => false);
    return this.sourcifySupported;
  }

  // Everything up to the request: trimmed sources, the deployed bytecode matched to the build-info, and the
  // ABI-encoded constructor arguments.
  private async prepare(
    task: Task,
    name: string,
    address: string,
    args: string | unknown[],
    libraries: Libraries = {}
  ): Promise<PreparedVerification> {
    const deployedBytecode = await Bytecode.getDeployedContractBytecode(
      address,
      this.network.provider,
      this.network.name
    );

    const buildInfo = task.buildInfoForContract(name);
    buildInfo.input = this.trimmedBuildInfoInput(name, buildInfo.input);

    const sourceName = findContractSourceName(buildInfo, name);
    const fullSourceName = `${sourceName}:${name}`;

    const contractInformation = await extractMatchingContractInformation(fullSourceName, buildInfo, deployedBytecode);
    if (!contractInformation) throw Error('Could not find a bytecode matching the requested contract');

    // Adapt input to the correct type.
    const normalizedLibraries = await Promise.all(
      Object.entries(libraries).map(async ([key, value]) => ({
        [key]: typeof value === 'string' ? value : await value.getAddress(),
      }))
    ).then((entries) => Object.assign({}, ...entries));
    const libraryInformation = await getLibraryInformation(contractInformation, normalizedLibraries);
    buildInfo.input.settings.libraries = libraryInformation.libraries;

    const deployArgumentsEncoded =
      typeof args == 'string'
        ? args
        : await encodeArguments(
            contractInformation.contractOutput.abi,
            contractInformation.sourceName,
            contractInformation.contractName,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            args as any[]
          );

    return {
      input: buildInfo.input,
      contractName: fullSourceName,
      solcLongVersion: contractInformation.solcLongVersion,
      constructorArguments: deployArgumentsEncoded,
    };
  }

  // The RPC can see the code before Etherscan has indexed it, and until then Etherscan answers "Unable to locate
  // ContractCode". Submitting is the check: it works with every API plan, unlike the proxy module, which a free key
  // cannot use on paid-tier chains such as Base.
  private async submitToEtherscan(address: string, prepared: PreparedVerification) {
    const deadline = Date.now() + EXPLORER_BYTECODE_TIMEOUT_MS;
    let announced = false;

    for (;;) {
      try {
        return await this.etherscanInstance.verify(
          address,
          JSON.stringify(prepared.input),
          prepared.contractName,
          `v${prepared.solcLongVersion}`,
          prepared.constructorArguments
        );
      } catch (error) {
        // Not instanceof: hardhat-verify's errors reset their prototype to NomicLabsHardhatPluginError.
        if (!(error instanceof Error && error.name === 'ContractVerificationMissingBytecodeError')) throw error;
      }

      if (!announced) {
        logger.log(`Waiting for Etherscan to index bytecode at ${address}`, '⏳', 'yellow');
        announced = true;
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `Etherscan has not indexed bytecode at ${address} after ${EXPLORER_BYTECODE_TIMEOUT_MS / 1000}s`
        );
      }
      await sleep(EXPLORER_BYTECODE_POLL_MS);
    }
  }

  private async get(fields: Record<string, string>): Promise<{ status?: string; result?: unknown }> {
    const url = new URL(this.etherscanInstance.apiUrl);
    url.search = this.parameters(fields).toString();
    return (await fetch(url)).json();
  }

  private async post(fields: Record<string, string>): Promise<{ status?: string; result?: unknown }> {
    const url = new URL(this.etherscanInstance.apiUrl);
    const { chainid, ...body } = Object.fromEntries(this.parameters(fields));
    if (chainid !== undefined) url.search = new URLSearchParams({ chainid }).toString();
    return (await fetch(url, { method: 'POST', body: new URLSearchParams(body) })).json();
  }

  private parameters(fields: Record<string, string>): URLSearchParams {
    const { apiKey, chainId } = this.etherscanInstance;
    const parameters = new URLSearchParams({ apikey: apiKey, ...fields });
    if (chainId !== undefined) parameters.set('chainid', String(chainId));
    return parameters;
  }

  // Trims the inputs of the build info to only keep imported files, avoiding submitting unnecessary source files for
  // verification (e.g. mocks). This is required because Hardhat compiles entire projects at once, resulting in a single
  // huge build info.
  private trimmedBuildInfoInput(contractName: string, input: CompilerInput): CompilerInput {
    // First we find all sources imported from our contract
    const sourceName = this.getContractSourceName(contractName, input);
    const importedSourceNames = this.getContractImportedSourceNames(
      sourceName,
      input,
      new Set<string>().add(sourceName)
    );

    // Then, we keep only those inputs. This method also preserves the order of the files, which may be important in
    // some versions of solc.
    return {
      ...input,
      sources: Object.keys(input.sources)
        .filter((source) => importedSourceNames.has(source) || source.includes('@openzeppelin'))
        .map((source) => ({ [source]: input.sources[source] }))
        .reduce((previous, current) => Object.assign(previous, current), {}),
    };
  }

  private getAbsoluteSourcePath(relativeSourcePath: string, input: CompilerInput): string {
    // We're not actually converting from relative to absolute but rather guessing: we'll extract the filename from the
    // relative path, and then look for a source name in the inputs that matches it.
    const contractName = (relativeSourcePath.match(/.*\/([\w'-]+)\.sol/) as RegExpMatchArray)[1];
    return this.getContractSourceName(contractName, input);
  }

  private getContractSourceName(contractName: string, input: CompilerInput): string {
    const absoluteSourcePath = Object.keys(input.sources).find((absoluteSourcePath) =>
      absoluteSourcePath.includes(`/${contractName}.sol`)
    );

    if (absoluteSourcePath === undefined) {
      throw new Error(`Could not find source name for ${contractName}`);
    }

    return absoluteSourcePath;
  }

  private getContractImportedSourceNames(
    sourceName: string,
    input: CompilerInput,
    previousSourceNames: Set<string>
  ): Set<string> {
    // tolerant: Vault.sol names a modifier `transient`, which this parser lexes as a keyword.
    const ast = parser.parse(input.sources[sourceName].content, { tolerant: true });
    parser.visit(ast, {
      ImportDirective: (node) => {
        // Imported paths might be relative, so we convert them to absolute
        const importedSourceName = this.getAbsoluteSourcePath(node.path, input);

        if (!previousSourceNames.has(importedSourceName)) {
          // New source!
          previousSourceNames = this.getContractImportedSourceNames(
            importedSourceName,
            input,
            new Set(previousSourceNames).add(importedSourceName)
          );
        }
      },
    });

    return previousSourceNames;
  }
}
