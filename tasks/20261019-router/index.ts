import { RouterDeployment } from './input';
import { Task, TaskRunOptions } from '@src';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as RouterDeployment;
  const args = [input.Vault, input.WETH, input.Permit2, input.RouterVersion];
  await task.deployAndVerify('Router', args, from, force);
};
