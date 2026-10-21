import { GyroECLPPoolDeployment } from './input';
import { createMockGyroEclpPool, derivedEclpParams, eclpParams, MOCK_GYRO_ECLP_POOL } from './mock';
import {
  poolCreatedAddress,
  saveContractDeploymentTransactionHash,
  Task,
  TaskMode,
  TaskRunOptions,
  ZERO_BYTES32,
} from '@src';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as GyroECLPPoolDeployment;

  const args = [input.Vault, input.PauseWindowDuration, input.FactoryVersion, input.PoolVersion];
  const factory = await task.deployAndVerify('GyroECLPPoolFactory', args, from, force);

  if (task.mode === TaskMode.LIVE) {
    // Same skip as task.deploy: create the pool once, then verify it on later runs.
    if (force || !task.output({ ensure: false })['MockGyroECLPPool']) {
      const poolCreationReceipt = await createMockGyroEclpPool(factory, ZERO_BYTES32);
      const mockPoolAddress = poolCreatedAddress(factory, poolCreationReceipt);

      saveContractDeploymentTransactionHash(mockPoolAddress, poolCreationReceipt.hash, task.network);
      task.save({ MockGyroECLPPool: mockPoolAddress });
    }

    const mockPool = await task.instanceAt('GyroECLPPool', task.output()['MockGyroECLPPool']);

    await task.verify('GyroECLPPool', mockPool.target.toString(), [
      {
        name: MOCK_GYRO_ECLP_POOL.name,
        symbol: MOCK_GYRO_ECLP_POOL.symbol,
        eclpParams,
        derivedEclpParams,
        version: await factory.getPoolVersion(),
      },
      input.Vault,
    ]);
  }
};
