import { HOUR, Task, TaskMode, ZERO_ADDRESS } from '@src';

export type StableLPOracleDeployment = {
  Vault: string;
  SequencerUptimeFeed: string;
  UptimeResyncWindow: number;
  FactoryVersion: string;
  OracleVersion: number;
  MockStablePool: string;
  ShouldUseBlockTimeForOldestFeedUpdate: boolean;
  ShouldRevertIfVaultUnlocked: boolean;
};

const Vault = new Task('20261016-vault', TaskMode.READ_ONLY);
const MockStablePool = new Task('20261021-stable-pool', TaskMode.READ_ONLY);

const OracleVersion = 2;
const BaseVersion = { version: OracleVersion, deployment: '20261021-stable-pool-oracle' };

export default {
  Vault,
  // Sepolia has no sequencer uptime feed.
  SequencerUptimeFeed: ZERO_ADDRESS,
  UptimeResyncWindow: HOUR,
  FactoryVersion: JSON.stringify({ name: 'StableLPOracleFactory', ...BaseVersion }),
  OracleVersion,
  MockStablePool,
  ShouldUseBlockTimeForOldestFeedUpdate: false,
  ShouldRevertIfVaultUnlocked: true,
};
