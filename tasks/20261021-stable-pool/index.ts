import { StablePoolDeployment } from './input';
import { AMPLIFICATION, createMockStablePool, MOCK_STABLE_POOL } from './mock';
import {
  poolCreatedAddress,
  saveContractDeploymentTransactionHash,
  Task,
  TaskMode,
  TaskRunOptions,
  ZERO_BYTES32,
} from '@src';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as StablePoolDeployment;

  const args = [input.Vault, input.PauseWindowDuration, input.FactoryVersion, input.PoolVersion];
  const factory = await task.deployAndVerify('StablePoolFactory', args, from, force);

  if (task.mode === TaskMode.LIVE) {
    // Same skip as task.deploy: create the pool once, then verify it on later runs.
    if (force || !task.output({ ensure: false })['MockStablePool']) {
      const poolCreationReceipt = await createMockStablePool(factory, ZERO_BYTES32);
      const mockPoolAddress = poolCreatedAddress(factory, poolCreationReceipt);

      saveContractDeploymentTransactionHash(mockPoolAddress, poolCreationReceipt.hash, task.network);
      task.save({ MockStablePool: mockPoolAddress });
    }

    const mockPool = await task.instanceAt('StablePool', task.output()['MockStablePool']);

    await task.verify('StablePool', mockPool.target.toString(), [
      {
        name: MOCK_STABLE_POOL.name,
        symbol: MOCK_STABLE_POOL.symbol,
        amplificationParameter: AMPLIFICATION,
        version: await factory.getPoolVersion(),
      },
      input.Vault,
    ]);
  }
};
