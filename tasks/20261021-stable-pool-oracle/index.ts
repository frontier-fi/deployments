import { StableLPOracleDeployment } from './input';
import { createMockStableOracle } from './mock';
import {
  createdAddress,
  saveContractDeploymentTransactionHash,
  Task,
  TaskMode,
  TaskRunOptions,
  mockOracleFeeds,
} from '@src';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as StableLPOracleDeployment;
  const args = [
    input.Vault,
    input.SequencerUptimeFeed,
    input.UptimeResyncWindow,
    input.FactoryVersion,
    input.OracleVersion,
  ];
  const factory = await task.deployAndVerify('StableLPOracleFactory', args, from, force);

  if (task.mode === TaskMode.LIVE) {
    const pool = input.MockStablePool;

    // Same skip as task.deploy: create the oracle once, then verify it on later runs.
    if (force || !task.output({ ensure: false })['MockStableLPOracle']) {
      const receipt = await createMockStableOracle(
        factory,
        task.network,
        pool,
        input.ShouldUseBlockTimeForOldestFeedUpdate,
        input.ShouldRevertIfVaultUnlocked
      );
      const mockOracleAddress = createdAddress(factory, receipt, 'StableLPOracleCreated', 'oracle');

      saveContractDeploymentTransactionHash(mockOracleAddress, receipt.hash, task.network);
      task.save({ MockStableLPOracle: mockOracleAddress });
    }

    const mockOracle = await task.instanceAt('StableLPOracle', task.output()['MockStableLPOracle']);
    await task.verify('StableLPOracle', mockOracle.target.toString(), [
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
