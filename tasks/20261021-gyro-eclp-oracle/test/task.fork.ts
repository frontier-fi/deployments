import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';

import { createMockEclpOracle } from '../mock';
import { EclpLPOracleDeployment } from '../input';
import { createdAddress, describeForkTest, getForkedNetwork, HOUR, Task, TaskMode, ZERO_ADDRESS } from '@src';

// Block after the mock Gyro E-CLP deployment.
const FORK_BLOCK = 11963452;

describeForkTest('EclpLPOracle', 'sepolia', FORK_BLOCK, function () {
  let task: Task;
  let factory: Contract;
  let pool: string;
  let deployment: EclpLPOracleDeployment;

  before('run task', async () => {
    task = new Task('20261021-gyro-eclp-oracle', TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });
    factory = await task.deployedInstance('EclpLPOracleFactory');
    deployment = task.input() as EclpLPOracleDeployment;
    pool = deployment.MockGyroECLPPool;
  });

  it('deploys an oracle', async () => {
    const receipt = await createMockEclpOracle(
      factory,
      pool,
      deployment.ShouldUseBlockTimeForOldestFeedUpdate,
      deployment.ShouldRevertIfVaultUnlocked
    );
    await task.instanceAt('EclpLPOracle', createdAddress(factory, receipt, 'EclpLPOracleCreated', 'oracle'));
  });

  it('checks factory version', async () => {
    const version = JSON.parse(await factory.version());
    expect(version.name).to.equal('EclpLPOracleFactory');
    expect(version.version).to.equal(deployment.OracleVersion);
    expect(version.deployment).to.equal('20261021-gyro-eclp-oracle');
  });

  it('stores a 1 hour uptime resync window', async () => {
    expect(await factory.getUptimeResyncWindow()).to.equal(BigInt(HOUR));
  });

  it('has no sequencer uptime feed', async () => {
    expect(await factory.getSequencerUptimeFeed()).to.equal(ZERO_ADDRESS);
  });
});
