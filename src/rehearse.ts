import fs from 'fs';
import path from 'path';
import { getAddress, JsonRpcProvider } from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { assertForkChainId, useForkChainId } from './forkChain';
import { etherscanApiKey, rpcUrl } from './networks';
import logger, { Logger } from './logger';
import Task, { NO_VERIFIER_WARNING, TaskMode } from './task';
import { NETWORKS, Network } from './types';
import Verifier, { createVerifier } from './verifier';

const DEPLOYMENT_TXS_DIRECTORY = path.resolve(__dirname, '../deployment-txs');
const REJECTED = 'REHEARSAL_LEDGER_REJECT';
const REHEARSAL_BALANCE = '0x56BC75E2D63100000'; // 100 ETH

type PlanStep = { nonce: number; taskId: string | undefined };

type Plan = {
  deployer: string;
  steps: PlanStep[]; // one per nonce; taskId undefined means the nonce is burned
  taskOrder: string[];
  // Contracts the deployer created itself. Their address depends only on deployer and nonce, so it must match.
  directlyCreated: Set<string>;
};

type RecordedTx = { hash: string; from: string; to: string | null; input: string; value: string; gas: string };

// Replays the reference network's deployment on a fork of `fork`: same task order, same nonces, with the
// reference's failed nonces burned by 0-value self-transfers. Each contract's explorer verification is prepared but
// not submitted. Then runs every recorded transaction on the live chain through eth_simulateV1, which executes them
// with the node's own EVM and fork rules.
export async function rehearse(
  args: { fork: string; reference: string; key?: string; skipSimulation?: boolean; skipVerification?: boolean },
  hre: HardhatRuntimeEnvironment
): Promise<void> {
  Logger.setDefaults(false, false);
  if (hre.network.name !== 'hardhat') {
    throw new Error(`yarn rehearse does not broadcast. Re-run without --network ${hre.network.name}.`);
  }
  const fork = parseNetwork(args.fork);
  const reference = parseNetwork(args.reference);
  const forkUrl = rpcUrl(fork);
  useForkChainId(hre, fork);

  const verifier = args.skipVerification ? undefined : await dryRunVerifier(hre, fork, args.key);

  const plan = await buildPlan(hre, reference);
  printPlan(plan, fork);

  const files = snapshotOutputs(fork);
  try {
    const recorded = await runOnFork(hre, plan, fork, forkUrl, verifier);
    const mismatches = compareAddresses(plan, reference, fork);

    if (args.skipSimulation) {
      logger.warn('Skipping live simulation');
    } else {
      await simulateLive(forkUrl, recorded);
    }

    if (mismatches > 0) throw new Error(`${mismatches} deployer-created addresses differ from ${reference}`);
    if (verifier !== undefined && verifier.dryRunFailures.length > 0) {
      throw new Error(`Verification would fail for:\n  ${verifier.dryRunFailures.join('\n  ')}`);
    }
    logger.success(`Rehearsal on ${fork} matches ${reference}`);
  } finally {
    files.restore();
  }
}

// Built like the one yarn deploy uses (same key lookup, same chain config), but it only prepares requests.
async function dryRunVerifier(hre: HardhatRuntimeEnvironment, fork: Network, key?: string): Promise<Verifier> {
  const apiKey = key ?? etherscanApiKey();
  if (!apiKey) {
    throw new Error(
      'ETHERSCAN_API_KEY is not set, so yarn deploy would not verify. Set it, pass --key, or pass --skip-verification.'
    );
  }

  const verifier = await createVerifier(hre, fork, apiKey, { dryRun: true });

  // A single key selects Etherscan's v2 API, which takes the chain id instead of the explorer's own URL.
  const { apiUrl, chainId, browserUrl } = verifier.etherscanInstance;
  logger.log(`Explorer ${browserUrl} via ${apiUrl}${chainId === undefined ? '' : ` (chainid ${chainId})`}`, '');
  for (const line of await verifier.preflight()) logger.log(`  ${line}`, '');
  return verifier;
}

function parseNetwork(name: string): Network {
  if (!NETWORKS.includes(name as Network)) throw new Error(`Unknown network ${name}`);
  return name as Network;
}

// The reference's recorded transactions give each task's nonces. Nonces below the deployer's current one that no
// recorded transaction used were spent on transactions that failed, and must be burned on the new network too.
async function buildPlan(hre: HardhatRuntimeEnvironment, reference: Network): Promise<Plan> {
  const deploymentTxs: Record<string, string> = JSON.parse(
    fs.readFileSync(path.join(DEPLOYMENT_TXS_DIRECTORY, `${reference}.json`), 'utf8')
  );

  const taskOfAddress = new Map<string, string>();
  for (const id of Task.getAllTaskIds()) {
    const output = new Task(id, TaskMode.READ_ONLY, reference).output({ ensure: false });
    for (const address of Object.values(output)) taskOfAddress.set(address.toLowerCase(), id);
  }

  const provider = new JsonRpcProvider(rpcUrl(reference));
  const taskOfNonce = new Map<number, string>();
  const directlyCreated = new Set<string>();
  const deployers = new Set<string>();

  for (const [address, hash] of Object.entries(deploymentTxs)) {
    const tx = await provider.getTransaction(hash);
    if (tx === null) throw new Error(`Transaction ${hash} not found on ${reference}`);
    deployers.add(tx.from);

    const taskId = taskOfAddress.get(address.toLowerCase());
    if (taskId === undefined) throw new Error(`${address} on ${reference} is in no task output`);
    taskOfNonce.set(tx.nonce, taskId);
    if (tx.to === null) directlyCreated.add(getAddress(address));
  }

  if (deployers.size !== 1) throw new Error(`Expected one deployer on ${reference}, found ${[...deployers]}`);
  const deployer = [...deployers][0];
  const finalNonce = await provider.getTransactionCount(deployer, 'latest');

  const steps: PlanStep[] = [];
  for (let nonce = 0; nonce < finalNonce; nonce++) steps.push({ nonce, taskId: taskOfNonce.get(nonce) });

  const taskOrder: string[] = [];
  for (const step of steps) {
    if (step.taskId !== undefined && !taskOrder.includes(step.taskId)) taskOrder.push(step.taskId);
  }

  return { deployer, steps, taskOrder, directlyCreated };
}

function printPlan(plan: Plan, fork: Network): void {
  logger.log(`Deployer ${plan.deployer}, ${plan.steps.length} nonces`, '');
  for (const step of plan.steps) {
    const what =
      step.taskId === undefined ? 'BURN (0-value self-transfer)' : `yarn deploy --id ${step.taskId} --network ${fork}`;
    logger.log(`  nonce ${String(step.nonce).padStart(3)}  ${what}`, '');
  }
}

// LIVE mode writes outputs and transaction hashes for the rehearsed network. Put them back afterwards.
function snapshotOutputs(fork: Network): { restore: () => void } {
  const files = Task.getAllTaskIds().map((id) =>
    path.join(new Task(id, TaskMode.READ_ONLY).dir(), 'output', `${fork}.json`)
  );
  files.push(path.join(DEPLOYMENT_TXS_DIRECTORY, `${fork}.json`));
  const saved = new Map(files.map((file) => [file, fs.existsSync(file) ? fs.readFileSync(file) : undefined]));

  return {
    restore: () => {
      for (const [file, content] of saved) {
        if (content === undefined) fs.rmSync(file, { force: true });
        else fs.writeFileSync(file, content);
      }
    },
  };
}

async function runOnFork(
  hre: HardhatRuntimeEnvironment,
  plan: Plan,
  fork: Network,
  forkUrl: string,
  verifier: Verifier | undefined
): Promise<RecordedTx[]> {
  await hre.network.provider.request({ method: 'hardhat_reset', params: [{ forking: { jsonRpcUrl: forkUrl } }] });
  await assertForkChainId(hre, fork);
  await hre.network.provider.send('hardhat_impersonateAccount', [plan.deployer]);
  await hre.network.provider.send('hardhat_setBalance', [plan.deployer, REHEARSAL_BALANCE]);

  const burns = new Set(plan.steps.filter((step) => step.taskId === undefined).map((step) => step.nonce));
  const nonce = async () =>
    Number(await hre.network.provider.send('eth_getTransactionCount', [plan.deployer, 'latest']));
  const startNonce = await nonce();
  const forkBlock = Number(await hre.network.provider.send('eth_blockNumber', []));
  logger.log(`Fork of ${fork} at block ${forkBlock}, deployer nonce ${startNonce}`, '');

  // Live, the Ledger is the first signer, so instanceAt() contracts send from the deployer too.
  // Signing at a nonce that must be burned plays a Ledger rejection: the task stops, the nonce is burned, the task
  // is run again and resumes from its saved outputs.
  const hashes: string[] = [];
  const provider = hre.ethers.provider as unknown as { send: (method: string, params: unknown[]) => Promise<unknown> };
  const send = provider.send.bind(provider);
  provider.send = async (method, params) => {
    if (method === 'eth_accounts') return [plan.deployer];
    if (method !== 'eth_sendTransaction') return send(method, params);

    const { from } = (params as { from: string }[])[0];
    if (from.toLowerCase() === plan.deployer.toLowerCase() && burns.has(await nonce())) {
      throw new Error(`${REJECTED} at nonce ${await nonce()}`);
    }
    const hash = (await send(method, params)) as string;
    hashes.push(hash);
    return hash;
  };

  // With --skip-verification the tasks run without a verifier, and Task.verify warns once per contract about that;
  // report it once instead.
  const warn = logger.warn.bind(logger);
  let unverified = 0;
  logger.warn = (msg, error) => {
    if (msg === NO_VERIFIER_WARNING) unverified++;
    else warn(msg, error);
  };

  try {
    const from = await hre.ethers.getSigner(plan.deployer);
    for (const id of plan.taskOrder) {
      for (;;) {
        try {
          await new Task(id, TaskMode.LIVE, fork, verifier).run({ from });
          break;
        } catch (error) {
          if (!String(error).includes(REJECTED)) throw error;
          while (burns.has(await nonce())) {
            const burned = await nonce();
            const hash = (await hre.network.provider.send('eth_sendTransaction', [
              { from: plan.deployer, to: plan.deployer, value: '0x0' },
            ])) as string;
            hashes.push(hash);
            logger.log(`  burned nonce ${burned}`, '🔥');
          }
        }
      }

      const expected = Math.max(...plan.steps.filter((step) => step.taskId === id).map((step) => step.nonce)) + 1;
      const actual = await nonce();
      if (actual !== expected) throw new Error(`After ${id} the deployer nonce is ${actual}, expected ${expected}`);
      logger.success(`${id} done, nonce ${actual}`);
    }
  } finally {
    provider.send = send;
    logger.warn = warn;
  }
  // Resumed tasks verify their earlier contracts again, so this counts calls, not contracts.
  if (unverified > 0) logger.log(`Skipped ${unverified} explorer verification calls`, 'ℹ️ ');

  const recorded: RecordedTx[] = [];
  for (const hash of hashes) {
    const tx = (await hre.network.provider.send('eth_getTransactionByHash', [hash])) as RecordedTx & { nonce: string };
    recorded.push({ hash, from: tx.from, to: tx.to, input: tx.input, value: tx.value, gas: tx.gas });
  }
  return recorded;
}

function compareAddresses(plan: Plan, reference: Network, fork: Network): number {
  let mismatches = 0;
  for (const id of plan.taskOrder) {
    const task = new Task(id, TaskMode.READ_ONLY);
    const expected = task.output({ ensure: false, network: reference });
    const actual = task.output({ ensure: false, network: fork });

    for (const [name, address] of Object.entries(expected)) {
      const same = address.toLowerCase() === (actual[name] ?? '').toLowerCase();
      const direct = plan.directlyCreated.has(getAddress(address));
      if (same) {
        logger.success(`${id} ${name} ${address}`);
      } else if (direct) {
        mismatches++;
        logger.error(`${id} ${name} is ${actual[name]} on ${fork}, ${address} on ${reference}`);
      } else {
        // Created by a factory. Pool factories mix block.chainid into the CREATE2 salt, so these can differ.
        logger.warn(`${id} ${name} is ${actual[name]} on ${fork}, ${address} on ${reference} (factory-created)`);
      }
    }
  }
  return mismatches;
}

async function simulateLive(url: string, txs: RecordedTx[]): Promise<void> {
  const provider = new JsonRpcProvider(url);
  const from = txs[0].from;
  const startNonce = await provider.getTransactionCount(from, 'latest');
  const gasPrice = (await provider.getFeeData()).gasPrice ?? 0n;

  // One transaction per simulated block, so none is limited by another's gas.
  const blockStateCalls = txs.map((tx, i) => ({
    ...(i === 0 ? { stateOverrides: { [from]: { balance: REHEARSAL_BALANCE } } } : {}),
    calls: [
      {
        from: tx.from,
        ...(tx.to ? { to: tx.to } : {}),
        input: tx.input,
        value: tx.value,
        nonce: `0x${(startNonce + i).toString(16)}`,
        gas: tx.gas,
        maxFeePerGas: `0x${(gasPrice * 10n + 10n ** 9n).toString(16)}`,
        maxPriorityFeePerGas: '0x1',
      },
    ],
  }));

  type SimulatedCall = { status: string; gasUsed: string; error?: { message: string; data?: string } };
  let result: { number: string; calls: SimulatedCall[] }[];
  try {
    result = await provider.send('eth_simulateV1', [{ blockStateCalls, validation: true }, 'latest']);
  } catch (error) {
    throw new Error(`eth_simulateV1 failed on the live RPC (pass --skip-simulation to skip): ${error}`);
  }

  let failures = 0;
  let gasUsed = 0n;
  logger.log(`Live simulation on top of block ${Number(result[0].number) - 1}`, '');
  result.forEach((block, i) => {
    const call = block.calls[0];
    const used = BigInt(call.gasUsed);
    const limit = BigInt(txs[i].gas);
    gasUsed += used;
    const line = `nonce ${startNonce + i}: ${used} of ${limit} gas (${(
      (Number(limit - used) / Number(limit)) *
      100
    ).toFixed(1)}% headroom)`;
    if (call.status === '0x1') {
      logger.success(line);
    } else {
      failures++;
      logger.error(`${line} REVERTED ${call.error?.message ?? ''} ${call.error?.data ?? ''}`);
    }
  });

  const balance = await provider.getBalance(from);
  const cost = gasUsed * gasPrice;
  logger.log(
    `${gasUsed} gas, ${Number(cost) / 1e18} ETH at the current gas price before any L1 data fee; ` +
      `deployer holds ${Number(balance) / 1e18} ETH`,
    balance < cost ? '⚠️ ' : '⛽'
  );
  if (failures > 0) throw new Error(`${failures} transactions revert on the live chain`);
}
