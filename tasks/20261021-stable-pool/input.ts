import { MONTH, Task, TaskMode } from '@src';

export type StablePoolDeployment = {
  Vault: string;
  PauseWindowDuration: number;
  FactoryVersion: string;
  PoolVersion: string;
};

const Vault = new Task('20261016-vault', TaskMode.READ_ONLY);

const BaseVersion = { version: 1, deployment: '20261021-stable-pool' };

export default {
  Vault,
  PauseWindowDuration: 4 * 12 * MONTH, // 4 years
  FactoryVersion: JSON.stringify({ name: 'StablePoolFactory', ...BaseVersion }),
  PoolVersion: JSON.stringify({ name: 'StablePool', ...BaseVersion }),
};
