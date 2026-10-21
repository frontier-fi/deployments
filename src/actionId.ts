import { Contract, FunctionFragment, Interface } from 'ethers';
import fs from 'fs';
import { padEnd } from 'lodash';
import path from 'path';
import logger from './logger';
import { request, gql } from 'graphql-request';

import Task from './task';

export const ACTION_ID_DIRECTORY = path.join(__dirname, '../action-ids');

export type RoleData = {
  role: string;
  grantee: string;
  target: string;
};

// Define a type alias with a more meaningful name
export type ActionIdData = Record<string, string>;

export type TaskActionIds = Record<string, ContractActionIdData>;

export type ContractActionIdData = {
  factoryOutput?: string;
  factoryName?: string;
  actionIds: ActionIdData;
};

export type ActionIdInfo = {
  taskId: string;
  contractName: string;
  signature: string;
};

interface TheGraphPermissionEntry {
  id: string;
  account: string;
  action: {
    id: string;
  };
  txHash: string;
}

function safeReadJsonFile<T>(filePath: string): Record<string, T> {
  const fileExists = fs.existsSync(filePath) && fs.statSync(filePath).isFile();

  return fileExists ? JSON.parse(fs.readFileSync(filePath).toString()) : {};
}

export function getTaskActionIds(task: Task): TaskActionIds {
  const filePath = path.join(ACTION_ID_DIRECTORY, task.network, 'action-ids.json');
  const actionIdFileContents = safeReadJsonFile<TaskActionIds>(filePath);
  return actionIdFileContents[task.id];
}

export async function saveActionIds(
  task: Task,
  contractName: string,
  factoryOutput?: string,
  factoryName?: string
): Promise<void> {
  logger.log(`Generating action IDs for ${contractName} of ${task.id}`, '');

  const actionIds = await getActionIds(task, contractName, factoryOutput, factoryName);

  const actionIdsDir = path.join(ACTION_ID_DIRECTORY, task.network);
  if (!fs.existsSync(actionIdsDir)) fs.mkdirSync(actionIdsDir, { recursive: true });

  const filePath = path.join(actionIdsDir, 'action-ids.json');

  // Load the existing content if any exists.
  const newFileContents = safeReadJsonFile<TaskActionIds>(filePath);

  // Write the new entry.
  newFileContents[task.id] = newFileContents[task.id] ?? {};
  newFileContents[task.id][contractName] = { factoryOutput, actionIds, factoryName };

  fs.writeFileSync(filePath, JSON.stringify(newFileContents, null, 2));
}

export async function checkActionIds(task: Task): Promise<void> {
  const taskActionIdData = getTaskActionIds(task);
  if (taskActionIdData === undefined) return;

  for (const [contractName, actionIdData] of Object.entries(taskActionIdData)) {
    const expectedActionIds = await getActionIds(
      task,
      contractName,
      actionIdData.factoryOutput,
      actionIdData.factoryName
    );

    const actionIdsMatch = Object.entries(expectedActionIds).every(
      ([signature, expectedActionId]) => actionIdData.actionIds[signature] === expectedActionId
    );
    if (actionIdsMatch) {
      logger.success(`Verified recorded action IDs of contract '${contractName}' of task '${task.id}'`);
    } else {
      throw Error(
        `The recorded action IDs for '${contractName}' of task '${task.id}' does not match those calculated from onchain`
      );
    }
  }
}

export function checkActionIdUniqueness(network: string): void {
  const actionIdsDir = path.join(ACTION_ID_DIRECTORY, network);

  const filePath = path.join(actionIdsDir, 'action-ids.json');
  const actionIdFileContents = safeReadJsonFile<TaskActionIds>(filePath);

  const duplicateActionIdsMapping = getDuplicateActionIds(actionIdFileContents);

  const expectedCollisionsFilePath = path.join(actionIdsDir, 'expected-collisions.json');
  const expectedDuplicateActionIdsMapping = safeReadJsonFile<TaskActionIds>(expectedCollisionsFilePath);

  if (JSON.stringify(duplicateActionIdsMapping) === JSON.stringify(expectedDuplicateActionIdsMapping)) {
    logger.success(`Verified that no contracts unexpectedly share action IDs for ${network}`);
  } else {
    for (const [actionId, instances] of Object.entries(duplicateActionIdsMapping)) {
      if (JSON.stringify(instances) === JSON.stringify(expectedDuplicateActionIdsMapping[actionId])) {
        // Collisions that exactly match the expected list are ignored.
        continue;
      }

      // If there are unexpected collisions while running `save-action-ids`, this will generate detailed
      // warning messages. Follow the instructions below to update the `expected-collisions` file.
      logger.warn(`${instances.length} contracts share the action ID: ${actionId}`);
      for (const [index, actionIdInfo] of instances.entries()) {
        const prefix = `  ${index + 1}: ${actionIdInfo.contractName}::${actionIdInfo.signature}`;
        logger.warn(`${padEnd(prefix, 100)}(${actionIdInfo.taskId})`);
      }
    }

    // Write a file called `updated-expected-collisions`, with new entries added to resolve the warnings.
    //
    // If there is no `expected-collisions` file for this network, simply review the new file to ensure the
    // additions are valid, then rename `updated-expected-collisions` to `expected-collisions`.
    // If there is already an`expected-collisions` file, check the diff, then replace the old file with this one.
    //
    // Never make manual changes to the `expected-collisions` file, as this might result in "unsorted"
    // entries that cause `save-action-ids` to fail with no warnings.
    //
    // After renaming or replacing the collisions file, running `save-action-ids` again should
    // produce no warnings.
    fs.writeFileSync(
      path.join(actionIdsDir, 'updated-expected-collisions.json'),
      JSON.stringify(duplicateActionIdsMapping, null, 2)
    );
    throw Error(`There exist two duplicated action IDs across two separate contracts`);
  }
}

// Output keys for contracts created by a factory are prefixed with `Mock` (for example `MockWeightedPool`).
// The artifact and factory names drop that prefix (`WeightedPool`, `WeightedPoolFactory`).
export function actionIdTarget(
  task: Task,
  outputName: string,
  outputAddress: string
): { contractName: string; factoryOutput?: string } {
  try {
    task.artifact(outputName);
    return { contractName: outputName };
  } catch (error) {
    if (!outputName.startsWith('Mock')) throw error;
    const contractName = outputName.slice('Mock'.length);
    task.artifact(contractName);
    return { contractName, factoryOutput: outputAddress };
  }
}

export async function getActionIds(
  task: Task,
  contractName: string,
  factoryOutput?: string,
  factoryName?: string
): Promise<ActionIdData> {
  const artifact = task.artifact(contractName);

  const { ignoredFunctions } = safeReadJsonFile<string[]>(path.join(ACTION_ID_DIRECTORY, 'ignored-functions.json'));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contractInterface = new Interface(artifact.abi as any);
  const allFunctions: FunctionFragment[] = [];
  contractInterface.forEachFunction((func) => allFunctions.push(func));
  const contractFunctions = allFunctions
    .filter((func) => ['nonpayable', 'payable'].includes(func.stateMutability))
    .filter((func) => !ignoredFunctions.includes(func.format()))
    .sort((a, b) => (a.format() < b.format() ? -1 : 1))
    .map((func) => [func.format(), func] as [string, FunctionFragment]); // Sort functions alphabetically.

  const actionIdSource = await getActionIdSource(task, contractName, factoryOutput, factoryName);
  if (actionIdSource === undefined) return {};

  return getActionIdsFromSource(contractFunctions, actionIdSource);
}

/**
 * Returns the deployed contract action IDs are read from.
 * Contracts without getActionId are permissionless and have no action IDs.
 */
async function getActionIdSource(
  task: Task,
  contractName: string,
  factoryOutput?: string,
  factoryName?: string
): Promise<Contract | undefined> {
  const artifact = task.artifact(contractName);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contractInterface = new Interface(artifact.abi as any);

  if (contractInterface.getFunction('getActionId') === null) return undefined;

  if (factoryOutput) {
    await checkFactoryOutput(task, contractName, factoryOutput, factoryName);
    return task.instanceAt(contractName, factoryOutput);
  }

  return task.deployedInstance(contractName);
}

async function getActionIdsFromSource(
  contractFunctions: [string, FunctionFragment][],
  actionIdSource: Contract
): Promise<ActionIdData> {
  const functionActionIds = await Promise.all(
    contractFunctions.map(async ([signature, contractFunction]) => {
      const functionSelector = contractFunction.selector;
      return [signature, await actionIdSource.getActionId(functionSelector)] as [string, string];
    })
  );

  return Object.fromEntries(functionActionIds);
}

function getDuplicateActionIds(actionIdFileContents: Record<string, TaskActionIds>): Record<string, ActionIdInfo[]> {
  // Reverse the mapping of `contractName -> signature -> actionId` to be `actionId -> [contractName, signature][]`.
  // This simplifies checking for duplicate actionIds to just reading the length of the arrays.
  const actionIdsMapping: Record<string, ActionIdInfo[]> = Object.entries(actionIdFileContents)
    .flatMap(([taskId, taskData]) =>
      Object.entries(taskData).flatMap(([contractName, contractData]) =>
        Object.entries(contractData.actionIds).map<[string, ActionIdInfo]>(([signature, actionId]) => [
          actionId,
          { taskId, contractName, signature },
        ])
      )
    )
    .reduce((acc: Record<string, ActionIdInfo[]>, [actionId, actionIdInfo]) => {
      acc[actionId] = acc[actionId] ?? [];
      acc[actionId].push(actionIdInfo);
      return acc;
    }, {});

  const duplicateActionIdsMapping = Object.fromEntries(
    Object.entries(actionIdsMapping).filter(([, instances]) => instances.length > 1)
  );

  return duplicateActionIdsMapping;
}

async function checkFactoryOutput(task: Task, contractName: string, factoryOutput: string, factoryName?: string) {
  // We must check that the factory output is actually an instance of the expected contract type. This is
  // not trivial due to usage of immutable and lack of knowledge of constructor arguments. However, this scenario
  // only arises with Pools created from factories, all of which share a useful property: their factory contract
  // name is <contractName>Factory, and they all have a function called 'isPoolFromFactory' we can use for this.

  factoryName = factoryName ?? `${contractName}Factory`;

  const factory = await task.deployedInstance(factoryName);
  const checker = factory.interface.getFunction('isPoolFromFactory')
    ? 'isPoolFromFactory'
    : factory.interface.getFunction('isOracleFromFactory')
    ? 'isOracleFromFactory'
    : undefined;
  if (checker === undefined) {
    throw Error(`${factoryName} has no isPoolFromFactory or isOracleFromFactory`);
  }
  if (!(await factory[checker](factoryOutput))) {
    throw Error(`The contract at ${factoryOutput} is not an instance of a ${contractName} coming from ${factoryName}`);
  }
}

/** Returns full info for a given actionId and network */
export function getActionIdInfo(actionId: string, network: string): ActionIdInfo | undefined {
  // read network JSON file from action-ids dir
  const tasks = safeReadJsonFile<TaskActionIds>(path.join(ACTION_ID_DIRECTORY, network, 'action-ids.json'));
  // filter all the entries which have the same actionId
  // and map them to an array of ActionIdInfo
  const entries = Object.entries(tasks)
    .filter(([, taskData]) =>
      Object.values(taskData).some((contractData) =>
        Object.entries(contractData.actionIds).some(([, hash]) => hash == actionId)
      )
    )
    .map(([taskId, taskData]) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const contracts = Object.entries(taskData).filter(([, contractData]) =>
        Object.entries(contractData.actionIds).some(([, hash]) => hash == actionId)
      )!;
      return contracts.map(([contractName, contractData]) => ({
        taskId,
        contractName,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        signature: Object.entries(contractData.actionIds).find(([, hash]) => hash == actionId)![0],
        actionId,
      }));
    })
    .flat();
  // we return first entry because all the collisions are verified by scripts
  return entries[0];
}

export async function fetchTheGraphPermissions(url: string): Promise<TheGraphPermissionEntry[]> {
  const query = gql`
    query {
      permissions {
        id
        account
        action {
          id
        }
        txHash
      }
    }
  `;

  const data = await request<{ permissions: TheGraphPermissionEntry[] }>(url, query);
  return data.permissions;
}
