import { HOUR, Task, TaskMode, ZERO_ADDRESS } from '@src';

export type WeightedLPOracleDeployment = {
  Vault: string;
  SequencerUptimeFeed: string;
  UptimeResyncWindow: number;
  FactoryVersion: string;
  OracleVersion: number;
  MockWeightedPool: string;
  ShouldUseBlockTimeForOldestFeedUpdate: boolean;
  ShouldRevertIfVaultUnlocked: boolean;
};

const Vault = new Task('20261016-vault', TaskMode.READ_ONLY);
const MockWeightedPool = new Task('20261021-weighted-pool', TaskMode.READ_ONLY);

const OracleVersion = 2;
const BaseVersion = { version: OracleVersion, deployment: '20261021-weighted-pool-oracle' };

export default {
  Vault,
  // Sepolia has no sequencer uptime feed.
  SequencerUptimeFeed: ZERO_ADDRESS,
  UptimeResyncWindow: HOUR,
  FactoryVersion: JSON.stringify({ name: 'WeightedLPOracleFactory', ...BaseVersion }),
  OracleVersion,
  MockWeightedPool,
  ShouldUseBlockTimeForOldestFeedUpdate: false,
  ShouldRevertIfVaultUnlocked: true,
};
