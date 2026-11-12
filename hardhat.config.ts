import '@nomicfoundation/hardhat-ethers';
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomicfoundation/hardhat-verify';
import '@nomicfoundation/hardhat-ledger';
import 'tsconfig-paths/register';

import { task } from 'hardhat/config';
import { TASK_TEST } from 'hardhat/builtin-tasks/task-names';
import { HardhatRuntimeEnvironment, HttpNetworkUserConfig } from 'hardhat/types';

import path from 'path';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';

import { checkArtifact, extractArtifact } from './src/artifact';
import test from './src/test';
import { dryRunAll } from './src/dryRun';
import { rehearse } from './src/rehearse';
import Task, { TaskMode } from './src/task';
import { createVerifier } from './src/verifier';
import logger, { Logger } from './src/logger';
import {
  actionIdTarget,
  checkActionIds,
  checkActionIdUniqueness,
  saveActionIds,
  getActionIdInfo,
} from './src/actionId';
import { checkContractDeploymentAddresses, saveContractDeploymentAddresses, withRetries } from './src/network';
import { etherscanApiKey, rpcUrl, SUPPORTED_NETWORKS } from './src/networks';
import { DEPLOYER } from './src/constants';

// One entry per network in addresses/.supported-networks.json, with its RPC url from src/networks.ts.
// The signer is DEPLOYER_PRIVATE_KEY if set, otherwise the Ledger at LEDGER_ACCOUNT (default DEPLOYER).
function liveNetworks(): Record<string, HttpNetworkUserConfig & { ledgerAccounts: string[] }> {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const networks: Record<string, HttpNetworkUserConfig & { ledgerAccounts: string[] }> = {};
  for (const [name, info] of Object.entries(SUPPORTED_NETWORKS)) {
    networks[name] = {
      url: rpcUrl(name),
      chainId: info.chainId,
      // Not [] without a key: Hardhat wraps the Ledger provider in a local accounts one, which hides its account.
      accounts: privateKey ? [privateKey] : 'remote',
      ledgerAccounts: privateKey ? [] : [process.env.LEDGER_ACCOUNT ?? DEPLOYER],
    };
  }
  return networks;
}

task('deploy', 'Run deployment task')
  .addParam('id', 'Deployment task ID')
  .addFlag('force', 'Ignore previous deployments')
  .addOptionalParam('key', 'Etherscan API key to verify contracts')
  .setAction(
    async (args: { id: string; force?: boolean; key?: string; verbose?: boolean }, hre: HardhatRuntimeEnvironment) => {
      Logger.setDefaults(false, args.verbose || false);

      const apiKey = args.key ?? etherscanApiKey();
      const verifier = apiKey ? await createVerifier(hre, hre.network.name, apiKey) : undefined;
      await new Task(args.id, TaskMode.LIVE, hre.network.name, verifier).run(args);
    }
  );

task('verify-contract', `Verify a task's deployment on a block explorer`)
  .addParam('id', 'Deployment task ID')
  .addParam('name', 'Contract name')
  .addParam('address', 'Contract address')
  .addParam('args', 'ABI-encoded constructor arguments')
  .addOptionalParam('key', 'Etherscan API key to verify contracts')
  .setAction(
    async (
      args: { id: string; name: string; address: string; key?: string; args: string; verbose?: boolean },
      hre: HardhatRuntimeEnvironment
    ) => {
      Logger.setDefaults(false, args.verbose || false);

      const apiKey = args.key ?? etherscanApiKey();
      const verifier = apiKey ? await createVerifier(hre, hre.network.name, apiKey) : undefined;

      // Contracts can only be verified in Live mode
      await new Task(args.id, TaskMode.LIVE, hre.network.name, verifier).verify(args.name, args.address, args.args);
    }
  );

task('extract-artifacts', `Extract contract artifacts from their build-info`)
  .addOptionalParam('id', 'Specific task ID')
  .addOptionalParam('file', 'Target build-info file name')
  .addOptionalParam('name', 'Contract name')
  .setAction(async (args: { id?: string; file?: string; name?: string; verbose?: boolean }) => {
    Logger.setDefaults(false, args.verbose || false);

    if (args.id) {
      const task = new Task(args.id, TaskMode.READ_ONLY);
      extractArtifact(task, args.file, args.name);
    } else {
      for (const taskID of Task.getAllTaskIds()) {
        const task = new Task(taskID, TaskMode.READ_ONLY);
        extractArtifact(task, args.file, args.name);
      }
    }
  });

task('check-deployments', `Check that all tasks' deployments correspond to their build-info and inputs`)
  .addOptionalParam('id', 'Specific task ID')
  .setAction(async (args: { id?: string; force?: boolean; verbose?: boolean }, hre: HardhatRuntimeEnvironment) => {
    // The force argument above is actually not passed (and not required or used in CHECK mode), but it is the easiest
    // way to address type issues.

    Logger.setDefaults(false, args.verbose || false);
    logger.log(`Checking deployments for ${hre.network.name}...`, '');

    if (args.id) {
      await new Task(args.id, TaskMode.CHECK, hre.network.name).run(args);
    } else {
      for (const taskID of Task.getAllTaskIds()) {
        if (taskID.startsWith('00000000-')) {
          continue;
        }

        const task = new Task(taskID, TaskMode.CHECK, hre.network.name);
        const outputDir = path.resolve(task.dir(), 'output');

        if (existsSync(outputDir) && statSync(outputDir).isDirectory()) {
          const outputFiles = readdirSync(outputDir);
          if (outputFiles.some((outputFile) => outputFile === `${hre.network.name}.json`)) {
            // Not all tasks have outputs for all networks, so we skip those that don't
            await withRetries(async () => task.run(args));
          }
        }
      }
    }
  });

task('check-artifacts', `check that contract artifacts correspond to their build-info`)
  .addOptionalParam('id', 'Specific task ID')
  .setAction(async (args: { id?: string; verbose?: boolean }) => {
    Logger.setDefaults(false, args.verbose || false);

    if (args.id) {
      const task = new Task(args.id, TaskMode.READ_ONLY);
      checkArtifact(task);
    } else {
      for (const taskID of Task.getAllTaskIds()) {
        const task = new Task(taskID, TaskMode.READ_ONLY);
        checkArtifact(task);
      }
    }
  });

task('save-action-ids', `Print the action IDs for a particular contract and checks their uniqueness`)
  .addOptionalParam('id', 'Specific task ID')
  .addOptionalParam('name', 'Contract name')
  .addOptionalParam('address', 'Address of Pool created from a factory')
  .addOptionalParam('factory', 'Name of pool factory (only if it is not `<contract>Factory`')
  .setAction(
    async (
      args: { id: string; name: string; address?: string; factory?: string; verbose?: boolean },
      hre: HardhatRuntimeEnvironment
    ) => {
      async function saveActionIdsTask(
        args: { id: string; name: string; address?: string; factory?: string; verbose?: boolean },
        hre: HardhatRuntimeEnvironment
      ) {
        Logger.setDefaults(false, args.verbose || false);

        // The user is calculating action IDs for a contract which isn't included in the task outputs.
        // Most likely this is for a pool which is to be deployed from a factory contract deployed as part of the task.
        if (args.address) {
          if (!args.id || !args.name) {
            throw new Error(
              "Provided an address for Pool created from a factory but didn't specify task or contract name."
            );
          }
          const task = new Task(args.id, TaskMode.READ_ONLY, hre.network.name);
          await saveActionIds(task, args.name, args.address, args.factory);
          return;
        }

        // The user is calculating the action IDs for a particular task or contract within a particular task.
        if (args.id && args.name) {
          const task = new Task(args.id, TaskMode.READ_ONLY, hre.network.name);
          await saveActionIds(task, args.name);
          return;
        }

        async function generateActionIdsForTask(taskId: string): Promise<void> {
          const task = new Task(taskId, TaskMode.READ_ONLY, hre.network.name);
          const outputDir = path.resolve(task.dir(), 'output');

          if (existsSync(outputDir) && statSync(outputDir).isDirectory()) {
            for (const outputFile of readdirSync(outputDir)) {
              const outputFilePath = path.resolve(outputDir, outputFile);
              if (outputFile === `${hre.network.name}.json` && statSync(outputFilePath).isFile()) {
                const fileContents = JSON.parse(readFileSync(outputFilePath).toString());
                const contractNames = Object.keys(fileContents);

                for (const outputName of contractNames) {
                  const { contractName, factoryOutput } = actionIdTarget(task, outputName, fileContents[outputName]);
                  await saveActionIds(task, contractName, factoryOutput);
                }
              }
            }
          }
        }

        if (args.id) {
          await generateActionIdsForTask(args.id);
          return;
        }

        // We're calculating action IDs for whichever contracts we can pull enough information from disk for.
        // This will calculate action IDs for any contracts which are a named output from a task.
        for (const taskID of Task.getAllTaskIds()) {
          await generateActionIdsForTask(taskID);
        }
      }

      await saveActionIdsTask(args, hre);
      checkActionIdUniqueness(hre.network.name);
    }
  );

task('check-action-ids', `Check that contract action-ids correspond the expected values`)
  .addOptionalParam('id', 'Specific task ID')
  .setAction(async (args: { id?: string; verbose?: boolean }, hre: HardhatRuntimeEnvironment) => {
    Logger.setDefaults(false, args.verbose || false);
    logger.log(`Checking action IDs for ${hre.network.name}...`, '');

    if (args.id) {
      const task = new Task(args.id, TaskMode.READ_ONLY, hre.network.name);
      await checkActionIds(task);
    } else {
      for (const taskID of Task.getAllTaskIds()) {
        const task = new Task(taskID, TaskMode.READ_ONLY, hre.network.name);
        await withRetries(async () => checkActionIds(task));
      }
    }
    checkActionIdUniqueness(hre.network.name);
  });

task('get-action-id-info', `Returns all the matches for the given actionId`)
  .addPositionalParam('id', 'ActionId to use for the lookup')
  .setAction(async (args: { id: string; verbose?: boolean }, hre: HardhatRuntimeEnvironment) => {
    Logger.setDefaults(false, args.verbose || false);
    logger.info(`Looking for action ID info on ${hre.network.name}...`);

    const actionIdInfo = await getActionIdInfo(args.id, hre.network.name);
    if (actionIdInfo) {
      logger.log(`Found the following matches:`, '');
      logger.log(JSON.stringify(actionIdInfo, null, 2), '');
    } else {
      logger.log(`No entries found for the actionId`, '');
    }
  });

task('build-address-lookup', `Build a lookup table from contract addresses to the relevant deployment`).setAction(
  async (args: { verbose?: boolean }, hre: HardhatRuntimeEnvironment) => {
    Logger.setDefaults(false, args.verbose || false);
    if (hre.network.name === 'hardhat') {
      logger.warn(`invalid network: ${hre.network.name}`);
      return;
    }

    // Create Task objects, excluding tokens tasks.
    const tasks = Task.getAllTaskIds()
      .filter((taskId) => !taskId.startsWith('00000000-'))
      .map((taskId) => new Task(taskId, TaskMode.READ_ONLY, hre.network.name));

    saveContractDeploymentAddresses(tasks, hre.network.name);
    logger.success(`Address lookup generated for network ${hre.network.name}`);
  }
);

task(
  'check-address-lookup',
  `Check whether the existing lookup table from contract addresses to the relevant deployments is correct`
).setAction(async (args: { verbose?: boolean }, hre: HardhatRuntimeEnvironment) => {
  Logger.setDefaults(false, args.verbose || false);
  if (hre.network.name === 'hardhat') {
    logger.warn(`invalid network: ${hre.network.name}`);
    return;
  }

  // Create Task objects, excluding tokens tasks.
  const tasks = Task.getAllTaskIds()
    .filter((taskId) => !taskId.startsWith('00000000-'))
    .map((taskId) => new Task(taskId, TaskMode.READ_ONLY, hre.network.name));

  const addressLookupFileOk = checkContractDeploymentAddresses(tasks, hre.network.name);
  if (!addressLookupFileOk) {
    throw new Error(
      `Address lookup file is incorrect for network ${hre.network.name}. Please run 'build-address-lookup' to regenerate it`
    );
  } else {
    logger.success(`Address lookup file is correct for network ${hre.network.name}`);
  }
});

task(TASK_TEST)
  .addOptionalParam('id', 'Specific task ID of the fork test to run.')
  .addOptionalParam('deployer', 'Public address to impersonate as the deployer on the fork.')
  .setAction(test);

task('dry-run', 'Run tasks on a fork of one network, with its chain id')
  .addParam('fork', 'Network to fork')
  .addOptionalParam('id', 'Specific task ID to run')
  .addOptionalParam('deployer', 'Public address to impersonate as the deployer on the fork.')
  .setAction(dryRunAll);

task('rehearse', `Replay a reference network's deployment order and nonces on a fork, then simulate it live`)
  .addParam('fork', 'Network to rehearse the deployment for')
  .addOptionalParam('reference', 'Network whose task order and nonces to copy', 'sepolia')
  .addOptionalParam('key', 'Etherscan API key to prepare verification with')
  .addFlag('skipSimulation', 'Skip the eth_simulateV1 replay on the live chain')
  .addFlag('skipVerification', 'Do not prepare explorer verification')
  .setAction(rehearse);

export default {
  networks: liveNetworks(),
  mocha: {
    timeout: 600000,
  },
  etherscan: {
    customChains: [],
  },
};
