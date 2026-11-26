import { UpdatableRateProviderBalV3FactoryDeployment } from './input';
import { createMockUpdatableRateProvider, MOCK_INITIAL_VALUE } from './mock';
import {
  createdAddress,
  saveContractDeploymentTransactionHash,
  Task,
  TaskMode,
  TaskRunOptions,
  ZERO_ADDRESS,
} from '@src';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as UpdatableRateProviderBalV3FactoryDeployment;

  const args = [input.Owner, input.FactoryVersion, input.RateProviderVersion];
  const factory = await task.deployAndVerify('UpdatableRateProviderBalV3Factory', args, from, force);

  if (task.mode === TaskMode.LIVE) {
    // Same skip as task.deploy: create the rate provider once, then verify it on later runs.
    if (force || !task.output({ ensure: false })['MockUpdatableRateProviderBalV3']) {
      const receipt = await createMockUpdatableRateProvider(factory, input.Owner);
      const mockRateProviderAddress = createdAddress(factory, receipt, 'RateProviderCreated', 'rateProvider');

      saveContractDeploymentTransactionHash(mockRateProviderAddress, receipt.hash, task.network);
      task.save({ MockUpdatableRateProviderBalV3: mockRateProviderAddress });
    }

    const mockRateProvider = await task.instanceAt(
      'UpdatableRateProviderBalV3',
      task.output()['MockUpdatableRateProviderBalV3']
    );
    await task.verify('UpdatableRateProviderBalV3', mockRateProvider.target.toString(), [
      ZERO_ADDRESS,
      false,
      MOCK_INITIAL_VALUE,
      input.Owner,
      ZERO_ADDRESS,
    ]);
  }
};
