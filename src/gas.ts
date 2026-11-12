import { JsonRpcProvider } from 'ethers';
import { EIP1193Provider, HardhatRuntimeEnvironment } from 'hardhat/types';

// yarn rehearse runs tasks on a Hardhat fork, yet a task must still choose the gas limits of the chain the fork stands
// for: Hardhat's EVM keeps the pre-Glamsterdam schedule and rejects a limit above the 2^24 transaction cap.
let rehearsalTarget: string | undefined;
let pending: { fork: bigint; live: bigint } | undefined;

export function setRehearsalTarget(rpcUrl: string | undefined): void {
  rehearsalTarget = rpcUrl;
  pending = undefined;
}

// Glamsterdam blocks carry a block access list hash. Its schedule charges code deposit from a state-gas reservoir.
export async function targetHasStateGas(hre: HardhatRuntimeEnvironment): Promise<boolean> {
  if (hre.network.name !== 'hardhat') return latestBlockHasAccessList(hre.network.provider);
  if (rehearsalTarget === undefined) return false;
  const provider = new JsonRpcProvider(rehearsalTarget);
  return latestBlockHasAccessList({ request: ({ method, params }) => provider.send(method, params ?? []) });
}

// The limit to send with: `live` on a live chain, `fork` on Hardhat. In a rehearsal, `live` is kept for the
// transaction that is sent next with the `fork` limit, so the replay on the live chain uses it (takeLiveGasLimit).
export function gasLimitFor(hre: HardhatRuntimeEnvironment, limits: { live: number; fork: number }): number {
  if (hre.network.name !== 'hardhat') return limits.live;
  if (rehearsalTarget !== undefined) pending = { fork: BigInt(limits.fork), live: BigInt(limits.live) };
  return limits.fork;
}

// Called for every transaction a rehearsal sends. A pending limit belongs to this transaction only if it carries the
// fork limit; either way it is spent, so it cannot attach to a later one.
export function takeLiveGasLimit(sentGas: bigint | undefined): bigint | undefined {
  const taken = pending;
  pending = undefined;
  return taken !== undefined && sentGas === taken.fork ? taken.live : undefined;
}

async function latestBlockHasAccessList(provider: Pick<EIP1193Provider, 'request'>): Promise<boolean> {
  const block = (await provider.request({ method: 'eth_getBlockByNumber', params: ['latest', false] })) as {
    blockAccessListHash?: string | null;
  } | null;
  return Boolean(block?.blockAccessListHash);
}
