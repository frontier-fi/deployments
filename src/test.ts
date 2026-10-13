import fs from 'fs';
import path from 'path';
import { RunSuperFunction, HardhatRuntimeEnvironment, HttpNetworkConfig, HardhatNetworkConfig } from 'hardhat/types';

import { dryRun } from './dryRun';
import Task from './task';
import { NETWORKS } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

const TEST_ROOTS = ['tasks', 'scripts', 'deprecated'];

function findTaskTests(dir = ''): string[] {
  if (dir === '') {
    return TEST_ROOTS.filter((root) => fs.existsSync(root)).flatMap((root) => findTaskTests(root));
  }

  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name === 'test') {
      for (const file of fs.readdirSync(full)) {
        if (file.endsWith('.ts')) files.push(path.resolve(full, file));
      }
    } else {
      files.push(...findTaskTests(full));
    }
  }
  return files;
}

export default async function (args: any, hre: HardhatRuntimeEnvironment, run: RunSuperFunction<any>): Promise<void> {
  const ids: string[] = args.id ? [args.id] : Task.getAllTaskIds();
  for (const id of ids) {
    for (const fork of NETWORKS) {
      await dryRun({ id, fork, deployer: args.deployer }, hre);
    }
  }

  if (!args.testFiles?.length) {
    args.testFiles = findTaskTests();
  }

  if (args.id) {
    args.testFiles = args.testFiles.filter((file: string) => file.includes(args.id));
  }

  if (args.testFiles.length === 0) {
    return;
  }

  await run(args);
}

export function getForkedNetwork(hre: HardhatRuntimeEnvironment): string {
  const config = hre.network.config as HardhatNetworkConfig;
  if (!config.forking || !config.forking.url) throw Error(`No forks found on network ${hre.network.name}`);

  const network = Object.entries(hre.config.networks).find(([, networkConfig]) => {
    const httpNetworkConfig = networkConfig as HttpNetworkConfig;
    return httpNetworkConfig.url && httpNetworkConfig.url === config?.forking?.url;
  });

  if (!network) throw Error(`No network found matching fork from ${config.forking.url}`);
  return network[0];
}
