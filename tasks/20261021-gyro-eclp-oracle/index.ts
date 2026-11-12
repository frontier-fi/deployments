import { EclpLPOracleDeployment } from './input';
import { createMockEclpOracle } from './mock';
import {
  createdAddress,
  saveContractDeploymentTransactionHash,
  Task,
  TaskMode,
  TaskRunOptions,
  mockOracleFeeds,
} from '@src';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as EclpLPOracleDeployment;
  const args = [
    input.Vault,
    input.SequencerUptimeFeed,
    input.UptimeResyncWindow,
    input.FactoryVersion,
    input.OracleVersion,
  ];
  const factory = await task.deployAndVerify('EclpLPOracleFactory', args, from, force);

  if (task.mode === TaskMode.LIVE) {
    const pool = input.MockGyroECLPPool;

    // Same skip as task.deploy: create the oracle once, then verify it on later runs.
    if (force || !task.output({ ensure: false })['MockEclpLPOracle']) {
      const receipt = await createMockEclpOracle(
        factory,
        task.network,
        pool,
        input.ShouldUseBlockTimeForOldestFeedUpdate,
        input.ShouldRevertIfVaultUnlocked
      );
      const mockOracleAddress = createdAddress(factory, receipt, 'EclpLPOracleCreated', 'oracle');

      saveContractDeploymentTransactionHash(mockOracleAddress, receipt.hash, task.network);
      task.save({ MockEclpLPOracle: mockOracleAddress });
    }

    const mockOracle = await task.instanceAt('EclpLPOracle', task.output()['MockEclpLPOracle']);
    await task.verify('EclpLPOracle', mockOracle.target.toString(), [
      input.Vault,
      pool,
      mockOracleFeeds(task.network),
      input.SequencerUptimeFeed,
      input.UptimeResyncWindow,
      input.ShouldUseBlockTimeForOldestFeedUpdate,
      input.ShouldRevertIfVaultUnlocked,
      input.OracleVersion,
    ]);
  }
};
