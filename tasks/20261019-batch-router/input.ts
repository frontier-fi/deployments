import { PERMIT2, Task, TaskMode, wethByNetwork } from '@src';

export type BatchRouterDeployment = {
  Vault: string;
  WETH: string;
  Permit2: string;
  BatchRouterVersion: string;
};

const Vault = new Task('20261016-vault', TaskMode.READ_ONLY);

const BatchRouterVersion = JSON.stringify({
  name: 'BatchRouter',
  version: 1,
  deployment: '20261019-batch-router',
});

export default {
  Vault,
  Permit2: PERMIT2,
  BatchRouterVersion,
  ...wethByNetwork(),
};
