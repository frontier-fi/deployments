import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';

import { createMockStablePool } from '../mock';
import { describeForkTest, getForkedNetwork, MONTH, ONES_BYTES32, poolCreatedAddress, Task, TaskMode } from '@src';

// Block after the last router deployment. Create calls decimals(), so both tokens must already exist.
const FORK_BLOCK = 11956558;
const PAUSE_WINDOW = 4n * 12n * BigInt(MONTH);

describeForkTest('StablePool', 'sepolia', FORK_BLOCK, function () {
  let task: Task;
  let factory: Contract;

  before('run task', async () => {
    task = new Task('20261021-stable-pool', TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });
    factory = await task.deployedInstance('StablePoolFactory');
  });

  it('deploys a pool', async () => {
    const receipt = await createMockStablePool(factory, ONES_BYTES32);
    await task.instanceAt('StablePool', poolCreatedAddress(factory, receipt));
  });

  it('checks factory version', async () => {
    const version = JSON.parse(await factory.version());
    expect(version.name).to.equal('StablePoolFactory');
    expect(version.version).to.equal(1);
    expect(version.deployment).to.equal('20261021-stable-pool');
  });

  it('stores a 4 year pause window', async () => {
    expect(await factory.getPauseWindowDuration()).to.equal(PAUSE_WINDOW);
  });
});
