import { CompilerInput, Libraries, Network } from 'hardhat/types';
import * as parser from '@solidity-parser/parser';
import { Etherscan } from '@nomicfoundation/hardhat-verify/etherscan';

import Task from './task';
import { findContractSourceName } from './buildinfo';
import { ContractVerificationMissingBytecodeError } from '@nomicfoundation/hardhat-verify/internal/errors';
import { encodeArguments, sleep } from '@nomicfoundation/hardhat-verify/internal/utilities';
import {
  extractMatchingContractInformation,
  getLibraryInformation,
} from '@nomicfoundation/hardhat-verify/internal/solc/artifacts';
import { Bytecode } from '@nomicfoundation/hardhat-verify/internal/solc/bytecode';
import { ApiKey, ChainConfig } from '@nomicfoundation/hardhat-verify/types';
import logger from './logger';

const MAX_VERIFICATION_INTENTS = 3;
const EXPLORER_BYTECODE_POLL_MS = 5_000;
// Etherscan's verify endpoint rejects a contract until its backend has indexed the bytecode.
const EXPLORER_BYTECODE_TIMEOUT_MS = 180_000;

// Deployed on every chain this repo targets, and verified on each explorer.
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

type PreparedVerification = {
  sourceCode: string;
  contractName: string;
  compilerVersion: string;
  constructorArguments: string;
};

export default class Verifier {
  etherscanInstance: Etherscan;
  network: Network;
  // Prepare each request (sources, bytecode match, constructor arguments) without submitting it.
  dryRun: boolean;
  dryRunFailures: string[] = [];

  constructor(_network: Network, _apiKey: ApiKey | undefined, _chainConfig: ChainConfig, _dryRun = false) {
    this.network = _network;
    this.dryRun = _dryRun;

    this.etherscanInstance = Etherscan.fromChainConfig(_apiKey, _chainConfig);
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

    const hasCode = await this.explorerHasBytecode(PERMIT2);
    report.push(
      hasCode === true
        ? 'proxy eth_getCode: ok'
        : 'proxy eth_getCode: not available with this key; verification submits without waiting for indexing'
    );

    return report;
  }

  // Exact match leaves SimilarMatch empty. A similar match names the other contract.
  async verificationMatch(address: string): Promise<string | undefined> {
    const { apiKey, apiUrl, chainId } = this.etherscanInstance;
    const parameters = new URLSearchParams({
      apikey: apiKey,
      module: 'contract',
      action: 'getsourcecode',
      address,
    });
    if (chainId !== undefined) parameters.set('chainid', String(chainId));

    const url = new URL(apiUrl);
    url.search = parameters.toString();

    const response = await fetch(url);
    const json = (await response.json()) as { result?: Array<{ SimilarMatch?: string; SourceCode?: string }> | string };
    const result = Array.isArray(json.result) ? json.result[0] : undefined;
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
    libraries: Libraries = {},
    intent = 1
  ): Promise<string> {
    if (this.dryRun) {
      try {
        await this.prepare(task, name, address, constructorArguments, libraries);
      } catch (error) {
        this.dryRunFailures.push(`${name} at ${address}: ${error instanceof Error ? error.message : error}`);
        throw error;
      }
      return this.etherscanInstance.getContractUrl(address);
    }

    const response = await this.verify(task, name, address, constructorArguments, libraries);

    if (response.isSuccess()) {
      return this.etherscanInstance.getContractUrl(address);
    } else if (intent < MAX_VERIFICATION_INTENTS && response.isBytecodeMissingInNetworkError()) {
      logger.info(`Could not find deployed bytecode in network, retrying ${intent++}/${MAX_VERIFICATION_INTENTS}...`);
      sleep(5000);
      return this.call(task, name, address, constructorArguments, libraries, intent++);
    } else {
      throw new Error(`The contract verification failed. Reason: ${response.message}`);
    }
  }

  private async verify(task: Task, name: string, address: string, args: string | unknown[], libraries: Libraries = {}) {
    const prepared = await this.prepare(task, name, address, args, libraries);
    const { message: guid } = await this.submitWhenExplorerHasBytecode(address, prepared);

    await sleep(1000);

    const verificationStatus = await this.etherscanInstance.getVerificationStatus(guid);

    if (verificationStatus.isFailure() || verificationStatus.isSuccess()) {
      return verificationStatus;
    }

    throw new Error(`The API responded with an unexpected message: ${verificationStatus.message}`);
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
      sourceCode: JSON.stringify(buildInfo.input),
      contractName: fullSourceName,
      compilerVersion: `v${contractInformation.solcLongVersion}`,
      constructorArguments: deployArgumentsEncoded,
    };
  }

  // The RPC can already see the code while Etherscan's verify call still returns "does not have bytecode".
  private async submitWhenExplorerHasBytecode(address: string, prepared: PreparedVerification) {
    const deadline = Date.now() + EXPLORER_BYTECODE_TIMEOUT_MS;
    let announced = false;

    for (;;) {
      // Unknown when the key cannot use the proxy module on this chain: submit, and retry on missing bytecode.
      if ((await this.explorerHasBytecode(address)) !== false) {
        try {
          return await this.etherscanInstance.verify(
            address,
            prepared.sourceCode,
            prepared.contractName,
            prepared.compilerVersion,
            prepared.constructorArguments
          );
        } catch (error) {
          if (!(error instanceof ContractVerificationMissingBytecodeError)) throw error;
        }
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

  // undefined when the explorer cannot answer, e.g. Etherscan's free plan has no proxy module on Base.
  private async explorerHasBytecode(address: string): Promise<boolean | undefined> {
    try {
      const json = await this.get({ module: 'proxy', action: 'eth_getCode', address, tag: 'latest' });
      if (typeof json.result !== 'string' || !json.result.startsWith('0x')) return undefined;
      return /^0x[0-9a-fA-F]{2,}$/.test(json.result);
    } catch {
      return false;
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
