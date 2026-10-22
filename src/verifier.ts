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

export default class Verifier {
  etherscanInstance: Etherscan;
  network: Network;

  constructor(_network: Network, _apiKey: ApiKey | undefined, _chainConfig: ChainConfig) {
    this.network = _network;

    this.etherscanInstance = Etherscan.fromChainConfig(_apiKey, _chainConfig);
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

    const { message: guid } = await this.submitWhenExplorerHasBytecode(
      address,
      JSON.stringify(buildInfo.input),
      fullSourceName,
      `v${contractInformation.solcLongVersion}`,
      deployArgumentsEncoded
    );

    await sleep(1000);

    const verificationStatus = await this.etherscanInstance.getVerificationStatus(guid);

    if (verificationStatus.isFailure() || verificationStatus.isSuccess()) {
      return verificationStatus;
    }

    throw new Error(`The API responded with an unexpected message: ${verificationStatus.message}`);
  }

  // The RPC can already see the code while Etherscan's verify call still returns "does not have bytecode".
  private async submitWhenExplorerHasBytecode(
    address: string,
    sourceCode: string,
    contractName: string,
    compilerVersion: string,
    constructorArguments: string
  ) {
    const deadline = Date.now() + EXPLORER_BYTECODE_TIMEOUT_MS;
    let announced = false;

    for (;;) {
      if (await this.explorerHasBytecode(address)) {
        try {
          return await this.etherscanInstance.verify(
            address,
            sourceCode,
            contractName,
            compilerVersion,
            constructorArguments
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

  private async explorerHasBytecode(address: string): Promise<boolean> {
    const { apiKey, apiUrl, chainId } = this.etherscanInstance;
    const parameters = new URLSearchParams({
      apikey: apiKey,
      module: 'proxy',
      action: 'eth_getCode',
      address,
      tag: 'latest',
    });
    if (chainId !== undefined) parameters.set('chainid', String(chainId));

    const url = new URL(apiUrl);
    url.search = parameters.toString();

    try {
      const response = await fetch(url);
      const json = (await response.json()) as { result?: unknown };
      return typeof json.result === 'string' && /^0x[0-9a-fA-F]{2,}$/.test(json.result);
    } catch {
      return false;
    }
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
