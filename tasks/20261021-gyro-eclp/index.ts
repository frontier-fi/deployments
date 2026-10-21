import { GyroECLPPoolDeployment } from './input';
import { Task, TaskRunOptions } from '@src';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as GyroECLPPoolDeployment;
  const args = [input.Vault, input.PauseWindowDuration, input.FactoryVersion, input.PoolVersion];
  await task.deployAndVerify('GyroECLPPoolFactory', args, from, force);
};
