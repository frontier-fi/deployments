import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

type CompilerContractOutput = {
  abi?: unknown[];
  evm?: {
    bytecode?: { object?: string };
    deployedBytecode?: { object?: string };
  };
  [key: string]: unknown;
};

type SolcOutput = {
  errors?: Array<{ severity?: string; formattedMessage?: string; message?: string }>;
  contracts: Record<string, Record<string, CompilerContractOutput>>;
  sources: Record<string, unknown>;
};

type FoundryBuildInfo = {
  _format?: string;
  solcVersion?: string;
  input?: {
    language?: string;
    sources?: Record<string, unknown>;
    settings?: Record<string, unknown>;
  };
  output?: {
    contracts?: Record<string, Record<string, CompilerContractOutput>>;
  };
};

const FOUNDRY_BUILD_INFO_FORMAT = 'ethers-rs-sol-build-info-1';
const HARDHAT_BUILD_INFO_FORMAT = 'hh-sol-build-info-1';
const HARDHAT_OUTPUT_SELECTION = {
  '*': {
    '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode', 'evm.methodIdentifiers', 'metadata'],
    '': ['ast'],
  },
};

function usage(): never {
  console.error('Usage: yarn foundry2hh --task <task-id> [--file <name-or-path>] [--solc <path-to-solc>]');
  process.exit(1);
}

function parseArgs(argv: string[]): { taskId: string; fileArg?: string; solcOverride?: string } {
  let taskId: string | undefined;
  let fileArg: string | undefined;
  let solcOverride: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--task' || arg === '--id') {
      const next = argv[++i];
      if (!next) usage();
      taskId = next;
    } else if (arg === '--file') {
      const next = argv[++i];
      if (!next) usage();
      fileArg = next;
    } else if (arg === '--solc') {
      const next = argv[++i];
      if (!next) usage();
      solcOverride = next;
    } else if (arg === '-h' || arg === '--help') {
      usage();
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }

  if (!taskId) usage();
  return { taskId, fileArg, solcOverride };
}

function readSolcLongVersion(solcBin: string, expectedVersion: string): string | undefined {
  try {
    const versionOut = execFileSync(solcBin, ['--version'], { encoding: 'utf8' });
    const match = versionOut.match(/Version:\s*(\d+\.\d+\.\d+\+commit\.[0-9a-f]+)/i);
    if (!match) return undefined;
    const longVersion = match[1];
    return longVersion.startsWith(`${expectedVersion}+commit.`) ? longVersion : undefined;
  } catch {
    return undefined;
  }
}

function findSolc(solcVersion: string, solcOverride?: string): { bin: string; solcLongVersion: string } {
  if (solcOverride) {
    const longVersion = readSolcLongVersion(solcOverride, solcVersion);
    if (!longVersion) {
      throw new Error(`--solc binary '${solcOverride}' does not match solc ${solcVersion}`);
    }
    return { bin: solcOverride, solcLongVersion: longVersion };
  }

  const home = os.homedir();
  const xdgData = process.env.XDG_DATA_HOME ?? path.join(home, '.local', 'share');
  const candidates = [
    path.join(home, '.svm', solcVersion, `solc-${solcVersion}`),
    path.join(home, 'Library', 'Application Support', 'svm', solcVersion, `solc-${solcVersion}`),
    path.join(xdgData, 'svm', solcVersion, `solc-${solcVersion}`),
    'solc',
  ];

  for (const candidate of candidates) {
    if (candidate !== 'solc' && !fs.existsSync(candidate)) continue;
    const longVersion = readSolcLongVersion(candidate, solcVersion);
    if (longVersion) return { bin: candidate, solcLongVersion: longVersion };
  }

  throw new Error(`Could not find solc ${solcVersion} (checked svm directories and PATH). Pass --solc <path>.`);
}

function verifyBytecodeParity(
  foundryContracts: Record<string, Record<string, CompilerContractOutput>>,
  solcContracts: Record<string, Record<string, CompilerContractOutput>>
): number {
  let verified = 0;

  for (const [sourceName, contracts] of Object.entries(foundryContracts)) {
    for (const [contractName, rawContract] of Object.entries(contracts)) {
      const compiled = solcContracts[sourceName]?.[contractName];
      if (!compiled) {
        throw new Error(`Recompiled output is missing ${sourceName}:${contractName}`);
      }

      const rawCreation = rawContract.evm?.bytecode?.object ?? '';
      const compiledCreation = compiled.evm?.bytecode?.object ?? '';
      if (rawCreation !== '' && rawCreation !== compiledCreation) {
        throw new Error(`Creation bytecode mismatch for ${sourceName}:${contractName}`);
      }

      const rawDeployed = rawContract.evm?.deployedBytecode?.object ?? '';
      const compiledDeployed = compiled.evm?.deployedBytecode?.object ?? '';
      if (rawDeployed !== '' && rawDeployed !== compiledDeployed) {
        throw new Error(`Deployed bytecode mismatch for ${sourceName}:${contractName}`);
      }

      verified++;
    }
  }

  return verified;
}

function resolveTargetFiles(buildInfoDir: string, fileArg?: string): string[] {
  if (fileArg) {
    if (fs.existsSync(fileArg) && fs.statSync(fileArg).isFile()) {
      return [path.resolve(fileArg)];
    }
    const candidate = path.join(buildInfoDir, fileArg.endsWith('.json') ? fileArg : `${fileArg}.json`);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return [path.resolve(candidate)];
    }
    throw new Error(`Could not find build-info file '${fileArg}'`);
  }

  if (!fs.existsSync(buildInfoDir) || !fs.statSync(buildInfoDir).isDirectory()) {
    throw new Error(`Build-info directory not found: ${buildInfoDir}`);
  }

  const foundryFiles = fs
    .readdirSync(buildInfoDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join(buildInfoDir, name))
    .filter((filePath) => {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as FoundryBuildInfo;
      return parsed._format === FOUNDRY_BUILD_INFO_FORMAT;
    });

  if (foundryFiles.length === 0) {
    throw new Error(`No Foundry build-info files (${FOUNDRY_BUILD_INFO_FORMAT}) found in ${buildInfoDir}`);
  }

  return foundryFiles;
}

function convertBuildInfo(foundryPath: string, taskId: string, buildInfoDir: string, solcOverride?: string): void {
  const raw = JSON.parse(fs.readFileSync(foundryPath, 'utf8')) as FoundryBuildInfo;
  if (
    !raw.solcVersion ||
    !raw.input?.language ||
    !raw.input?.sources ||
    !raw.input?.settings ||
    !raw.output?.contracts
  ) {
    throw new Error(`Invalid Foundry build-info file: ${foundryPath}`);
  }

  const { bin: solcBin, solcLongVersion } = findSolc(raw.solcVersion, solcOverride);

  const settings = JSON.parse(JSON.stringify(raw.input.settings)) as Record<string, unknown>;
  settings.outputSelection = HARDHAT_OUTPUT_SELECTION;

  const input = {
    language: raw.input.language,
    sources: raw.input.sources,
    settings,
  };

  const solcStdout = execFileSync(solcBin, ['--standard-json'], {
    input: JSON.stringify(input),
    maxBuffer: 100 * 1024 * 1024,
  }).toString();
  const solcOutput = JSON.parse(solcStdout) as SolcOutput;

  const errors = (solcOutput.errors ?? []).filter((entry) => entry.severity === 'error');
  if (errors.length > 0) {
    const messages = errors.map((entry) => entry.formattedMessage ?? entry.message ?? JSON.stringify(entry)).join('\n');
    throw new Error(`solc compilation failed:\n${messages}`);
  }

  const verifiedCount = verifyBytecodeParity(raw.output.contracts, solcOutput.contracts);

  const id = createHash('md5')
    .update(
      Buffer.from(
        JSON.stringify({
          _format: HARDHAT_BUILD_INFO_FORMAT,
          solcVersion: raw.solcVersion,
          solcLongVersion,
          input,
        })
      )
    )
    .digest('hex');

  const buildInfo = {
    id,
    _format: HARDHAT_BUILD_INFO_FORMAT,
    solcVersion: raw.solcVersion,
    solcLongVersion,
    input,
    output: {
      contracts: solcOutput.contracts,
      sources: solcOutput.sources,
    },
  };

  fs.mkdirSync(buildInfoDir, { recursive: true });
  const outPath = path.join(buildInfoDir, `${id}.json`);
  fs.writeFileSync(outPath, JSON.stringify(buildInfo));

  const resolvedInput = path.resolve(foundryPath);
  const resolvedOutput = path.resolve(outPath);
  if (path.dirname(resolvedInput) === path.resolve(buildInfoDir) && resolvedInput !== resolvedOutput) {
    fs.unlinkSync(resolvedInput);
  }

  console.log(`Converted ${path.basename(foundryPath)} -> ${outPath}`);
  console.log(`Compiler: ${solcLongVersion}, verified bytecode parity for ${verifiedCount} contract entries`);
  console.log(`Next: yarn extract-artifacts --id ${taskId} --name <ContractName> --file ${id}`);
}

function main(): void {
  const { taskId, fileArg, solcOverride } = parseArgs(process.argv.slice(2));

  const taskDir = path.resolve(__dirname, '../tasks', taskId);
  if (!fs.existsSync(taskDir) || !fs.statSync(taskDir).isDirectory()) {
    throw new Error(`Task directory not found: ${taskDir}`);
  }

  const buildInfoDir = path.join(taskDir, 'build-info');
  const targets = resolveTargetFiles(buildInfoDir, fileArg);
  for (const target of targets) {
    convertBuildInfo(target, taskId, buildInfoDir, solcOverride);
  }
}

main();
