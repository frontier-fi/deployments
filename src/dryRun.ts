import { getAddress } from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import logger, { Logger } from './logger';
import { impersonate } from './signers';
import Task, { TaskMode } from './task';
import { NETWORKS } from './types';

export async function dryRun(
  args: { id: string; fork: string; deployer?: string },
  hre: HardhatRuntimeEnvironment
): Promise<void> {
  Logger.setDefaults(false, false);
  if (hre.network.name !== 'hardhat') {
    throw new Error(`yarn test does not broadcast. Re-run without --network ${hre.network.name}.`);
  }

  if (!NETWORKS.includes(args.fork as (typeof NETWORKS)[number])) {
    throw new Error(`Unknown network ${args.fork}`);
  }

  const forkConfig = hre.config.networks[args.fork] as { url?: string } | undefined;
  if (!forkConfig?.url) {
    throw new Error(`No RPC url configured for ${args.fork}. Add it to ~/.hardhat/networks.json`);
  }

  const deployer = args.deployer === undefined ? undefined : parseDeployer(args.deployer);

  await hre.network.provider.request({
    method: 'hardhat_reset',
    params: [
      {
        forking: {
          jsonRpcUrl: forkConfig.url,
        },
      },
    ],
  });
  await hre.network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x0']);

  const from = deployer === undefined ? undefined : await impersonate(deployer);
  logger.log(`Dry run ${args.id} on ${args.fork}${deployer === undefined ? '' : ` from ${deployer}`}`, '');

  const task = new Task(args.id, TaskMode.TEST, args.fork);
  await task.run({ force: true, from });
  logger.success(`Dry run complete. Addresses written to output/test.json`);
  logger.log(JSON.stringify(task.output(), null, 2), '');
}

function parseDeployer(deployer: string): string {
  try {
    return getAddress(deployer);
  } catch {
    throw new Error(`Deployer must be an address, got ${deployer}`);
  }
}
