import { MONTH, Task, TaskMode } from '@src';

export type WeightedPoolDeployment = {
  Vault: string;
  PauseWindowDuration: number;
  FactoryVersion: string;
  PoolVersion: string;
};

const Vault = new Task('20261016-vault', TaskMode.READ_ONLY);

const BaseVersion = { version: 2, deployment: '20261021-weighted-pool' };

export default {
  Vault,
  PauseWindowDuration: 75 * 12 * MONTH, // 75 years
  FactoryVersion: JSON.stringify({ name: 'WeightedPoolFactory', ...BaseVersion }),
  PoolVersion: JSON.stringify({ name: 'WeightedPool', ...BaseVersion }),
};
