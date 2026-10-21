import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';

import { createMockStableOracle } from '../mock';
import { StableLPOracleDeployment } from '../input';
import { createdAddress, describeForkTest, getForkedNetwork, HOUR, Task, TaskMode, ZERO_ADDRESS } from '@src';

// Block after the mock stable pool deployment.
const FORK_BLOCK = 11963443;

describeForkTest('StableLPOracle', 'sepolia', FORK_BLOCK, function () {
  let task: Task;
  let factory: Contract;
  let pool: string;
  let deployment: StableLPOracleDeployment;

  before('run task', async () => {
    task = new Task('20261021-stable-pool-oracle', TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });
    factory = await task.deployedInstance('StableLPOracleFactory');
    deployment = task.input() as StableLPOracleDeployment;
    pool = deployment.MockStablePool;
  });

  it('deploys an oracle', async () => {
    const receipt = await createMockStableOracle(
      factory,
      pool,
      deployment.ShouldUseBlockTimeForOldestFeedUpdate,
      deployment.ShouldRevertIfVaultUnlocked
    );
    await task.instanceAt('StableLPOracle', createdAddress(factory, receipt, 'StableLPOracleCreated', 'oracle'));
  });

  it('checks factory version', async () => {
    const version = JSON.parse(await factory.version());
    expect(version.name).to.equal('StableLPOracleFactory');
    expect(version.version).to.equal(deployment.OracleVersion);
    expect(version.deployment).to.equal('20261021-stable-pool-oracle');
  });

  it('stores a 1 hour uptime resync window', async () => {
    expect(await factory.getUptimeResyncWindow()).to.equal(BigInt(HOUR));
  });

  it('has no sequencer uptime feed', async () => {
    expect(await factory.getSequencerUptimeFeed()).to.equal(ZERO_ADDRESS);
  });
});
