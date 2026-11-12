import { getAddress } from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { assertForkChainId, useForkChainId } from './forkChain';
import logger, { Logger } from './logger';
import { findContractDeploymentTransactionHash } from './network';
import { impersonate } from './signers';
import Task, { TaskMode } from './task';
import { NETWORKS, Network } from './types';

export async function dryRun(
  args: { id: string; fork: string; deployer?: string },
  hre: HardhatRuntimeEnvironment
): Promise<void> {
  Logger.setDefaults(false, false);
  if (hre.network.name !== 'hardhat') {
    throw new Error(`yarn test does not broadcast. Re-run without --network ${hre.network.name}.`);
  }

  if (!NETWORKS.includes(args.fork as Network)) {
    throw new Error(`Unknown network ${args.fork}`);
  }
  const network = args.fork as Network;

  const forkConfig = hre.config.networks[network] as { url?: string } | undefined;
  if (!forkConfig?.url) {
    throw new Error(`No RPC url configured for ${network}. Add it to ~/.hardhat/networks.json`);
  }

  const task = new Task(args.id, TaskMode.TEST, network);
  if (hasDeploymentTransaction(task, network)) {
    logger.log(`Skipping dry run of ${task.id} on ${network}: deployment transaction already recorded`, '');
    return;
  }

  const missing = missingDependency(task, network);
  if (missing !== undefined) {
    logger.log(
      `Skipping dry run of ${task.id} on ${network}: ${missing} is not deployed there yet. ` +
        `yarn rehearse ${network} runs the whole sequence`,
      ''
    );
    return;
  }

  useForkChainId(hre, network);
  await hre.network.provider.request({
    method: 'hardhat_reset',
    params: [{ forking: { jsonRpcUrl: forkConfig.url } }],
  });
  await assertForkChainId(hre, network);
  await hre.network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x0']);
  await hre.network.provider.request({ method: 'hardhat_setLoggingEnabled', params: [true] });
  await registerTaskBuildInfo(hre, task);

  const deployerAddress = args.deployer ?? readDeployer(task);
  const deployer = deployerAddress === undefined ? undefined : parseDeployer(deployerAddress);
  const from = deployer === undefined ? undefined : await impersonate(deployer);
  logger.log(`Dry run ${args.id} on ${network}${deployer === undefined ? '' : ` from ${deployer}`}`, '');

  await task.run({ force: true, from });
  logger.success(`Dry run complete. Addresses written to output/test.json`);
  logger.log(JSON.stringify(task.output(), null, 2), '');
}

// Every task, or only `id`, against one network. Run it in its own process: see useForkChainId.
export async function dryRunAll(
  args: { fork: string; id?: string; deployer?: string },
  hre: HardhatRuntimeEnvironment
): Promise<void> {
  const ids = args.id ? [args.id] : Task.getAllTaskIds();
  for (const id of ids) {
    await dryRun({ id, fork: args.fork, deployer: args.deployer }, hre);
  }
}

// Inputs read other tasks' outputs for the network, which only exist once those tasks are deployed there.
function missingDependency(task: Task, network: Network): string | undefined {
  try {
    task.input();
    return undefined;
  } catch (error) {
    const match = String(error).match(new RegExp(`tasks/([^/]+)/output/${network}\\.json`));
    if (match === null) throw error;
    return match[1];
  }
}

function hasDeploymentTransaction(task: Task, network: Network): boolean {
  const deployed = task.output({ ensure: false, network });
  return Object.values(deployed).some(
    (address) => findContractDeploymentTransactionHash(address, network) !== undefined
  );
}

async function registerTaskBuildInfo(hre: HardhatRuntimeEnvironment, task: Task): Promise<void> {
  for (const buildInfo of task.buildInfos()) {
    await hre.network.provider.request({
      method: 'hardhat_addCompilationResult',
      params: [buildInfo.solcVersion, buildInfo.input, buildInfo.output],
    });
  }
}

function readDeployer(task: Task): string | undefined {
  const deployer = task.rawInput().deployer;
  return typeof deployer === 'string' ? deployer : undefined;
}

function parseDeployer(deployer: string): string {
  try {
    return getAddress(deployer);
  } catch {
    throw new Error(`Deployer must be an address, got ${deployer}`);
  }
}
