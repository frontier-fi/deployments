import { PERMIT2, Task, TaskMode, wethByNetwork } from '@src';

export type RouterDeployment = {
  Vault: string;
  WETH: string;
  Permit2: string;
  RouterVersion: string;
};

const Vault = new Task('20261016-vault', TaskMode.READ_ONLY);

const RouterVersion = JSON.stringify({
  name: 'Router',
  version: 2,
  deployment: '20261019-router',
});

export default {
  Vault,
  Permit2: PERMIT2,
  RouterVersion,
  ...wethByNetwork(),
};
