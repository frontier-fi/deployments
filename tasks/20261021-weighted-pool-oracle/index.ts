import { WeightedLPOracleDeployment } from './input';
import { createMockWeightedOracle, MOCK_WEIGHTED_ORACLE_FEEDS } from './mock';
import { createdAddress, saveContractDeploymentTransactionHash, Task, TaskMode, TaskRunOptions } from '@src';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as WeightedLPOracleDeployment;
  const args = [
    input.Vault,
    input.SequencerUptimeFeed,
    input.UptimeResyncWindow,
    input.FactoryVersion,
    input.OracleVersion,
  ];
  const factory = await task.deployAndVerify('WeightedLPOracleFactory', args, from, force);

  if (task.mode === TaskMode.LIVE) {
    const pool = input.MockWeightedPool;

    // Same skip as task.deploy: create the oracle once, then verify it on later runs.
    if (force || !task.output({ ensure: false })['MockWeightedLPOracle']) {
      const receipt = await createMockWeightedOracle(
        factory,
        pool,
        input.ShouldUseBlockTimeForOldestFeedUpdate,
        input.ShouldRevertIfVaultUnlocked
      );
      const mockOracleAddress = createdAddress(factory, receipt, 'WeightedLPOracleCreated', 'oracle');

      saveContractDeploymentTransactionHash(mockOracleAddress, receipt.hash, task.network);
      task.save({ MockWeightedLPOracle: mockOracleAddress });
    }

    const mockOracle = await task.instanceAt('WeightedLPOracle', task.output()['MockWeightedLPOracle']);
    await task.verify('WeightedLPOracle', mockOracle.target.toString(), [
      input.Vault,
      pool,
      MOCK_WEIGHTED_ORACLE_FEEDS,
      input.SequencerUptimeFeed,
      input.UptimeResyncWindow,
      input.ShouldUseBlockTimeForOldestFeedUpdate,
      input.ShouldRevertIfVaultUnlocked,
      input.OracleVersion,
    ]);
  }
};
