import { WeightedPoolDeployment } from './input';
import { Task, TaskRunOptions } from '@src';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as WeightedPoolDeployment;
  const args = [input.Vault, input.PauseWindowDuration, input.FactoryVersion, input.PoolVersion];
  await task.deployAndVerify('WeightedPoolFactory', args, from, force);
};
