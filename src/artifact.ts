import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { Artifact, BuildInfo, CompilerOutputContract } from 'hardhat/types';
import path from 'path';
import logger from './logger';
import Task from './task';
import fs from 'fs';

const BUILD_INFO_ID = /^[0-9a-f]{32}$/;

/**
 * Extracts the artifact for the matching contract.
 * @param task - The task for which to extract the artifacts.
 * @param file - Name of the file within `build-info` where to look for the contract. All files within `build-info`
 * directory will be checked if undefined.
 * @param contract - Name of the contract to match. Filename shall be used if undefined.
 */
export function extractArtifact(task: Task, file?: string, contract?: string): void {
  const buildInfoDirectory = path.resolve(task.dir(), 'build-info');
  if (!existsSync(buildInfoDirectory) || !statSync(buildInfoDirectory).isDirectory()) return;

  if (file) {
    _extractArtifact(task, file, contract);
    return;
  }

  const aliases = task.buildInfoAliases();
  if (aliases !== undefined) {
    const entries = Object.entries(aliases).filter(([name]) => contract === undefined || name === contract);
    if (contract !== undefined && entries.length === 0) {
      throw Error(`No build-info alias for contract '${contract}' on task '${task.id}'`);
    }
    for (const [contractName, id] of entries) {
      _extractArtifact(task, id, contractName);
    }
    return;
  }

  for (const buildInfoFileName of readdirSync(buildInfoDirectory)) {
    const fileName = path.parse(buildInfoFileName).name;
    _extractArtifact(task, fileName, contract);
  }
}

function _extractArtifact(task: Task, file: string, contract?: string) {
  contract = contract ?? file;
  const artifact = task.artifact(contract, file);
  writeContractArtifact(task, contract, artifact);
  logger.success(`Artifacts created for ${contract} contract found in ${file} build-info file`);
}

/**
 * Checks that the artifact files for `task` matches what is contained in the build-info file.
 * @param task - The task for which to check artifact integrity.
 */
export function checkArtifact(task: Task): void {
  verifyBuildInfoIds(task);

  let readmeLines: string[] = [];

  const filePath = path.join(task.dir(), `README.md`);
  const readmeFileExists = fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  if (readmeFileExists) {
    const readmeContents = fs.readFileSync(filePath).toString();
    readmeLines = readmeContents.split('\n');
  }

  const artifactDirectory = path.resolve(task.dir(), 'artifact');

  if (existsSync(artifactDirectory) && statSync(artifactDirectory).isDirectory()) {
    for (const artifactFileName of readdirSync(artifactDirectory)) {
      const fileName = path.parse(artifactFileName).name;
      const contractName = fileName;

      const expectedArtifact = task.artifact(contractName, fileName);
      const actualArtifact = readContractArtifact(task, contractName);

      const artifactMatch = JSON.stringify(actualArtifact) === JSON.stringify(expectedArtifact);
      if (artifactMatch) {
        logger.success(`Verified artifact integrity of contract '${contractName}' of task '${task.id}'`);

        // Since this is an *artifact* check, don't fail if there is no readme at all (mixing concerns).
        // If there is a readme, it must contain a link to all artifacts, though.
        if (readmeFileExists) {
          checkReadmeArtifactLink(task, contractName, readmeLines);
        }
      } else {
        throw Error(
          `The artifact for contract '${contractName}' of task '${task.id}' does not match the contents of its build-info`
        );
      }
    }
  }
}

/**
 * Ensure there is a readme with the expected link to the artifact file (and no invalid ones).
 */
function checkReadmeArtifactLink(task: Task, contractName: string, readmeLines: string[]): void {
  const expectedContent = `- [\`${contractName}\` artifact](./artifact/${contractName}.json)`;
  const linkFound = readmeLines.find((line) => line.toLowerCase() == expectedContent.toLowerCase()) !== undefined;

  if (linkFound) {
    logger.success(`Verified artifact link for contract '${contractName}' of task '${task.id}'`);
  } else {
    throw Error(`Missing or malformed artifact link for contract '${contractName}' of task '${task.id}'`);
  }
}

/**
 * Read the saved artifact for the contract `contractName`.
 */
function verifyBuildInfoIds(task: Task): void {
  const buildInfoDirectory = path.resolve(task.dir(), 'build-info');
  if (!existsSync(buildInfoDirectory) || !statSync(buildInfoDirectory).isDirectory()) return;

  for (const fileName of readdirSync(buildInfoDirectory)) {
    if (!fileName.endsWith('.json')) continue;
    const info = JSON.parse(readFileSync(path.join(buildInfoDirectory, fileName)).toString()) as BuildInfo;
    const id = computeBuildInfoId(info);
    if (id !== info.id) {
      throw Error(`Build-info ${fileName} of task '${task.id}' has id '${info.id}', computed '${id}'`);
    }

    const baseName = path.parse(fileName).name;
    if (BUILD_INFO_ID.test(baseName) && baseName !== info.id) {
      throw Error(`Build-info file ${fileName} of task '${task.id}' does not match its id '${info.id}'`);
    }
    logger.success(`Verified build-info id ${info.id} of task '${task.id}'`);
  }

  for (const [contractName, id] of Object.entries(task.buildInfoAliases() ?? {})) {
    const info = task.buildInfos().find((candidate) => candidate.id === id);
    if (info === undefined) throw Error(`Build-info alias ${contractName} points at missing id '${id}'`);
    const present = Object.keys(info.output.contracts).some((sourceName) =>
      Object.keys(info.output.contracts[sourceName]).includes(contractName)
    );
    if (!present) throw Error(`Build-info ${id} does not contain contract '${contractName}'`);
  }
}

function computeBuildInfoId(info: BuildInfo): string {
  const json = JSON.stringify({
    _format: info._format,
    solcVersion: info.solcVersion,
    solcLongVersion: info.solcLongVersion,
    input: info.input,
  });
  return createHash('md5').update(Buffer.from(json)).digest('hex');
}

function readContractArtifact(task: Task, contractName: string): Artifact | null {
  // Read contract ABI from file
  const artifactFilePath = path.resolve(task.dir(), 'artifact', `${contractName}.json`);
  const artifactFileExists = existsSync(artifactFilePath) && statSync(artifactFilePath).isFile();
  const artifact = artifactFileExists ? JSON.parse(readFileSync(artifactFilePath).toString()) : null;

  return artifact;
}

/**
 * Write the ABI and bytecode for the contract `contractName` to the ABI and bytecode files.
 */
function writeContractArtifact(task: Task, contractName: string, artifact: Artifact): void {
  const artifactDirectory = path.resolve(task.dir(), 'artifact');
  if (!existsSync(artifactDirectory)) {
    mkdirSync(artifactDirectory);
  }
  const abiFilePath = path.resolve(artifactDirectory, `${contractName}.json`);
  writeFileSync(abiFilePath, JSON.stringify(artifact, null, 2));
}

// The code below is copied from the `hardhat-core` package
// https://github.com/NomicFoundation/hardhat/blob/080a25a7e188311d7e56366e1dae669db81aa2d7/packages/hardhat-core/src/internal/artifacts.ts#L870-L918

const ARTIFACT_FORMAT_VERSION = 'hh-sol-artifact-1';

/**
 * Retrieves an artifact for the given `contractName` from the compilation output.
 *
 * @param sourceName The contract's source name.
 * @param contractName the contract's name.
 * @param contractOutput the contract's compilation output as emitted by `solc`.
 */
export function getArtifactFromContractOutput(
  sourceName: string,
  contractName: string,
  contractOutput: CompilerOutputContract
): Artifact {
  const evmBytecode = contractOutput.evm && contractOutput.evm.bytecode;
  let bytecode: string = evmBytecode && evmBytecode.object ? evmBytecode.object : '';

  if (bytecode.slice(0, 2).toLowerCase() !== '0x') {
    bytecode = `0x${bytecode}`;
  }

  const evmDeployedBytecode = contractOutput.evm && contractOutput.evm.deployedBytecode;
  let deployedBytecode: string = evmDeployedBytecode && evmDeployedBytecode.object ? evmDeployedBytecode.object : '';

  if (deployedBytecode.slice(0, 2).toLowerCase() !== '0x') {
    deployedBytecode = `0x${deployedBytecode}`;
  }

  const linkReferences = evmBytecode && evmBytecode.linkReferences ? evmBytecode.linkReferences : {};
  const deployedLinkReferences =
    evmDeployedBytecode && evmDeployedBytecode.linkReferences ? evmDeployedBytecode.linkReferences : {};

  return {
    _format: ARTIFACT_FORMAT_VERSION,
    contractName,
    sourceName,
    abi: contractOutput.abi,
    bytecode,
    deployedBytecode,
    linkReferences,
    deployedLinkReferences,
  };
}
