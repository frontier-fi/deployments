import { PERMIT2, Task, TaskMode, wethByNetwork } from '@src';

export type CompositeLiquidityRouter = {
  Vault: string;
  WETH: string;
  Permit2: string;
  CompositeLiquidityRouterVersion: string;
};

const Vault = new Task('20261016-vault', TaskMode.READ_ONLY);
const BaseVersion = { version: 2, deployment: '20261020-composite-liquidity-router' };

export default {
  Vault,
  Permit2: PERMIT2,
  CompositeLiquidityRouterVersion: JSON.stringify({ name: 'CompositeLiquidityRouter', ...BaseVersion }),
  ...wethByNetwork(),
};
