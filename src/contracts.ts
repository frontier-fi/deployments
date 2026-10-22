import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract, TransactionRequest } from 'ethers';
import { Artifacts } from 'hardhat/internal/artifacts';

import logger from './logger';
import { getSigner } from './signers';
import { Artifact, Libraries, Param } from './types';
import path from 'path';
import * as Config from '../hardhat.config';

const CODE_POLL_INTERVAL_MS = 2_000;
const CODE_POLL_TIMEOUT_MS = 60_000;
// An empty account prices this calldata at intrinsic gas (~30k). A factory `create` deploys a contract.
const MIN_DEPLOYED_CODE_GAS = 100_000n;

// The deploy receipt can land before every RPC backend sees the bytecode. Hardhat estimates
// eth_estimateGas against "pending", which can still look empty after getCode("latest") succeeds,
// and that estimate is only intrinsic gas. Estimate against "latest" and return the limit so the
// signer does not estimate again.
export async function gasLimitForDeployedCode(factory: Contract, data: string): Promise<bigint> {
  const { ethers } = await import('hardhat');
  const to = await factory.getAddress();
  const runner = factory.runner;
  const from =
    runner !== null && typeof runner === 'object' && 'getAddress' in runner && typeof runner.getAddress === 'function'
      ? await runner.getAddress()
      : undefined;

  const request: TransactionRequest = { to, from, data, blockTag: 'latest' };
  const started = Date.now();
  let announced = false;
  let lastError: unknown;

  for (;;) {
    try {
      const gas = await ethers.provider.estimateGas(request);
      if (gas >= MIN_DEPLOYED_CODE_GAS) return gas;
    } catch (error) {
      const code = await ethers.provider.getCode(to);
      if (code !== '0x') throw error;
      lastError = error;
    }

    if (!announced) {
      logger.log(`Waiting for bytecode at ${to} to be visible to gas estimation`, '⏳', 'yellow');
      announced = true;
    }
    if (Date.now() - started >= CODE_POLL_TIMEOUT_MS) {
      const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
      throw new Error(
        `Bytecode at ${to} is not visible to gas estimation after ${CODE_POLL_TIMEOUT_MS / 1000}s${detail}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, CODE_POLL_INTERVAL_MS));
  }
}

export async function deploy(
  contract: Artifact | string,
  args: Array<Param> = [],
  from?: SignerWithAddress,
  libs?: Libraries
): Promise<Contract> {
  if (!args) args = [];
  if (!from) from = await getSigner();

  const artifact: Artifact = typeof contract === 'string' ? getArtifact(contract) : contract;

  const { ethers } = await import('hardhat');
  const factory = await ethers.getContractFactoryFromArtifact(artifact, { libraries: libs });
  const deployment = await factory.connect(from).deploy(...args);
  return deployment.waitForDeployment() as Promise<Contract>;
}

export async function instanceAt(contract: Artifact | string, address: string): Promise<Contract> {
  const artifact: Artifact = typeof contract === 'string' ? getArtifact(contract) : contract;

  const { ethers } = await import('hardhat');
  return ethers.getContractAt(artifact.abi, address);
}

export async function deploymentTxData(artifact: Artifact, args: Array<Param> = [], libs?: Libraries): Promise<string> {
  const { ethers } = await import('hardhat');
  const factory = await ethers.getContractFactoryFromArtifact(artifact, { libraries: libs });

  const tx = await factory.getDeployTransaction(...args);
  const { data } = tx;
  if (data === undefined) throw new Error('Deploy transaction with no data. Something is very wrong');

  return data.toString();
}

export function getArtifact(contract: string): Artifact {
  const segments = contract.split('/');
  const contractName = segments[segments.length - 1];
  const artifactsPath = contract.includes('/')
    ? `${path.dirname(require.resolve(`${segments[0]}/package.json`))}/artifacts`
    : path.resolve(Config.default.paths.artifacts);

  const artifacts = new Artifacts(artifactsPath);
  return artifacts.readArtifactSync(contractName);
}
