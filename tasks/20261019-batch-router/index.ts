import { BatchRouterDeployment } from './input';
import { Task, TaskRunOptions } from '@src';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as BatchRouterDeployment;
  const args = [input.Vault, input.WETH, input.Permit2, input.BatchRouterVersion];
  await task.deployAndVerify('BatchRouter', args, from, force);
};
