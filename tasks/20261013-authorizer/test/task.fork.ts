import { expect } from 'chai';
import { Contract, ethers } from 'ethers';
import hre from 'hardhat';

import { describeForkTest, getForkedNetwork, getSigner, impersonate, Task, TaskMode } from '@src';

describeForkTest('Authorizer', 'sepolia', 11919300, function () {
  const ACTION_ID = ethers.id('20261013-authorizer-test-action');

  let task: Task;
  let authorizer: Contract;

  before('run task', async () => {
    task = new Task('20261013-authorizer', TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });
    authorizer = await task.deployedInstance('Authorizer');
  });

  it('grants the default admin role to the configured admin', async () => {
    const admin = task.input().admin as string;
    expect(await authorizer.hasRole(await authorizer.DEFAULT_ADMIN_ROLE(), admin)).to.equal(true);
  });

  it('lets the admin grant an action id and ignores where', async () => {
    const admin = await impersonate(task.input().admin as string);
    const grantee = await getSigner(1);
    const stranger = ethers.Wallet.createRandom().address;

    expect(await authorizer.canPerform(ACTION_ID, grantee.address, stranger)).to.equal(false);

    await authorizer.connect(admin).grantRole(ACTION_ID, grantee.address);

    expect(await authorizer.canPerform(ACTION_ID, grantee.address, stranger)).to.equal(true);
    expect(await authorizer.canPerform(ACTION_ID, stranger, grantee.address)).to.equal(false);
  });
});
