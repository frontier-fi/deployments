import { WeightedPoolDeployment } from './input';
import { createMockWeightedPool, MOCK_WEIGHTED_POOL } from './mock';
import {
  poolCreatedAddress,
  saveContractDeploymentTransactionHash,
  sepoliaWethUsdc,
  Task,
  TaskMode,
  TaskRunOptions,
  ZERO_BYTES32,
} from '@src';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as WeightedPoolDeployment;

  const args = [input.Vault, input.PauseWindowDuration, input.FactoryVersion, input.PoolVersion];
  const factory = await task.deployAndVerify('WeightedPoolFactory', args, from, force);

  if (task.mode === TaskMode.LIVE) {
    // Same skip as task.deploy: create the pool once, then verify it on later runs.
    if (force || !task.output({ ensure: false })['MockWeightedPool']) {
      const poolCreationReceipt = await createMockWeightedPool(factory, ZERO_BYTES32);
      const mockPoolAddress = poolCreatedAddress(factory, poolCreationReceipt);

      saveContractDeploymentTransactionHash(mockPoolAddress, poolCreationReceipt.hash, task.network);
      task.save({ MockWeightedPool: mockPoolAddress });
    }

    const mockPool = await task.instanceAt('WeightedPool', task.output()['MockWeightedPool']);
    const tokens = sepoliaWethUsdc();

    // The factory derives these inside create, from each token's decimals.
    const minTokenBalances = await minimumTokenBalances(tokens.map((token) => token.token));
    await task.verify('WeightedPool', mockPool.target.toString(), [
      {
        name: MOCK_WEIGHTED_POOL.name,
        symbol: MOCK_WEIGHTED_POOL.symbol,
        numTokens: tokens.length,
        normalizedWeights: MOCK_WEIGHTED_POOL.normalizedWeights,
        version: await factory.getPoolVersion(),
        minTokenBalances,
      },
      input.Vault,
    ]);
  }
};

// Matches MinTokenBalanceLib.computeMinTokenBalances. Tokens with 12 decimals or fewer use 10^(18 - decimals).
async function minimumTokenBalances(tokens: string[]): Promise<bigint[]> {
  const { ethers } = await import('hardhat');
  const absoluteMin = 10n ** 6n;
  const balances: bigint[] = [];

  for (const token of tokens) {
    const erc20 = new ethers.Contract(token, ['function decimals() view returns (uint8)'], ethers.provider);
    const decimals = BigInt(await erc20.decimals());
    const atomicUnitFloor = 10n ** (18n - decimals);
    balances.push(atomicUnitFloor > absoluteMin ? atomicUnitFloor : absoluteMin);
  }

  return balances;
}
