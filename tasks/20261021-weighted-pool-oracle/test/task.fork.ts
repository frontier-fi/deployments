import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';

import { createMockWeightedOracle } from '../mock';
import { WeightedLPOracleDeployment } from '../input';
import { createdAddress, describeForkTest, getForkedNetwork, HOUR, Task, TaskMode, ZERO_ADDRESS } from '@src';

// Block after the mock weighted pool deployment.
const FORK_BLOCK = 11963280;

describeForkTest('WeightedLPOracle', 'sepolia', FORK_BLOCK, function () {
  let task: Task;
  let factory: Contract;
  let pool: string;
  let deployment: WeightedLPOracleDeployment;

  before('run task', async () => {
    task = new Task('20261021-weighted-pool-oracle', TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });
    factory = await task.deployedInstance('WeightedLPOracleFactory');
    deployment = task.input() as WeightedLPOracleDeployment;
    pool = deployment.MockWeightedPool;
  });

  it('deploys an oracle', async () => {
    const receipt = await createMockWeightedOracle(
      factory,
      pool,
      deployment.ShouldUseBlockTimeForOldestFeedUpdate,
      deployment.ShouldRevertIfVaultUnlocked
    );
    await task.instanceAt('WeightedLPOracle', createdAddress(factory, receipt, 'WeightedLPOracleCreated', 'oracle'));
  });

  it('checks factory version', async () => {
    const version = JSON.parse(await factory.version());
    expect(version.name).to.equal('WeightedLPOracleFactory');
    expect(version.version).to.equal(deployment.OracleVersion);
    expect(version.deployment).to.equal('20261021-weighted-pool-oracle');
  });

  it('stores a 1 hour uptime resync window', async () => {
    expect(await factory.getUptimeResyncWindow()).to.equal(BigInt(HOUR));
  });

  it('has no sequencer uptime feed', async () => {
    expect(await factory.getSequencerUptimeFeed()).to.equal(ZERO_ADDRESS);
  });
});
