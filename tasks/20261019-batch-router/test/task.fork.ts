import hre from 'hardhat';
import { expect } from 'chai';
import { Contract, ethers } from 'ethers';

import { describeForkTest, getForkedNetwork, getSigner, impersonate, Task, TaskMode } from '@src';
import { BatchRouterDeployment } from '../input';

// Block after the Vault deployment.
const FORK_BLOCK = 11940609;

describeForkTest('BatchRouter', 'sepolia', FORK_BLOCK, function () {
  let task: Task;
  let batchRouter: Contract;
  let input: BatchRouterDeployment;

  before('run task', async () => {
    task = new Task('20261019-batch-router', TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });
    input = task.input() as BatchRouterDeployment;
    batchRouter = await task.deployedInstance('BatchRouter');
  });

  it('checks batch router version', async () => {
    const batchRouterVersion = JSON.parse(await batchRouter.version());
    expect(batchRouterVersion.name).to.equal('BatchRouter');
    expect(batchRouterVersion.version).to.equal(1);
    expect(batchRouterVersion.deployment).to.equal('20261019-batch-router');
  });

  it('accepts ETH only from WETH', async () => {
    const wethSigner = await impersonate(input.WETH);
    const alice = await getSigner();

    const wethTx = wethSigner.sendTransaction({
      to: batchRouter.target,
      value: ethers.parseEther('1.0'),
    });
    await expect(wethTx).to.not.be.reverted;

    const aliceTx = alice.sendTransaction({
      to: batchRouter.target,
      value: ethers.parseEther('1.0'),
    });
    await expect(aliceTx).to.be.reverted;
  });
});
