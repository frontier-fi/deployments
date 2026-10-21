import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';

import { createMockGyroEclpPool } from '../mock';
import { describeForkTest, getForkedNetwork, MONTH, ONES_BYTES32, poolCreatedAddress, Task, TaskMode } from '@src';

// Block after the last router deployment. Create calls decimals(), so both tokens must already exist.
const FORK_BLOCK = 11956558;
const PAUSE_WINDOW = 75n * 12n * BigInt(MONTH);

describeForkTest('GyroECLPPool', 'sepolia', FORK_BLOCK, function () {
  let task: Task;
  let factory: Contract;

  before('run task', async () => {
    task = new Task('20261021-gyro-eclp', TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });
    factory = await task.deployedInstance('GyroECLPPoolFactory');
  });

  it('deploys a pool', async () => {
    const receipt = await createMockGyroEclpPool(factory, ONES_BYTES32);
    await task.instanceAt('GyroECLPPool', poolCreatedAddress(factory, receipt));
  });

  it('checks factory version', async () => {
    const version = JSON.parse(await factory.version());
    expect(version.name).to.equal('GyroECLPPoolFactory');
    expect(version.version).to.equal(2);
    expect(version.deployment).to.equal('20261021-gyro-eclp');
  });

  it('stores a 75 year pause window', async () => {
    expect(await factory.getPauseWindowDuration()).to.equal(PAUSE_WINDOW);
  });
});
