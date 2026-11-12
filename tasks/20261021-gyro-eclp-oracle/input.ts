import { HOUR, sequencerUptimeFeedByNetwork, Task, TaskMode } from '@src';

export type EclpLPOracleDeployment = {
  Vault: string;
  SequencerUptimeFeed: string;
  UptimeResyncWindow: number;
  FactoryVersion: string;
  OracleVersion: number;
  MockGyroECLPPool: string;
  ShouldUseBlockTimeForOldestFeedUpdate: boolean;
  ShouldRevertIfVaultUnlocked: boolean;
};

const Vault = new Task('20261016-vault', TaskMode.READ_ONLY);
const MockGyroECLPPool = new Task('20261021-gyro-eclp', TaskMode.READ_ONLY);

const OracleVersion = 1;
const BaseVersion = { version: OracleVersion, deployment: '20261021-gyro-eclp-oracle' };

export default {
  Vault,
  UptimeResyncWindow: HOUR,
  FactoryVersion: JSON.stringify({ name: 'EclpLPOracleFactory', ...BaseVersion }),
  OracleVersion,
  MockGyroECLPPool,
  ShouldUseBlockTimeForOldestFeedUpdate: false,
  ShouldRevertIfVaultUnlocked: true,
  ...sequencerUptimeFeedByNetwork(),
};
