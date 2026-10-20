import { PERMIT2, Task, TaskMode, wethByNetwork } from '@src';

export type BufferRouterDeployment = {
  Vault: string;
  WETH: string;
  Permit2: string;
  BufferRouterVersion: string;
};

const Vault = new Task('20261016-vault', TaskMode.READ_ONLY);
const BaseVersion = { version: 1, deployment: '20261020-buffer-router' };

export default {
  Vault,
  Permit2: PERMIT2,
  BufferRouterVersion: JSON.stringify({ name: 'BufferRouter', ...BaseVersion }),
  ...wethByNetwork(),
};
