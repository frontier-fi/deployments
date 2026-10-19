import hre from 'hardhat';
import { expect } from 'chai';
import { Contract, ethers } from 'ethers';

import { describeForkTest, getForkedNetwork, getSigner, impersonate, Task, TaskMode } from '@src';
import { RouterDeployment } from '../input';

// Block after the Vault deployment.
const FORK_BLOCK = 11940609;

describeForkTest('Router', 'sepolia', FORK_BLOCK, function () {
  let task: Task;
  let router: Contract;
  let input: RouterDeployment;

  before('run task', async () => {
    task = new Task('20261019-router', TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });
    input = task.input() as RouterDeployment;
    router = await task.deployedInstance('Router');
  });

  it('checks router version', async () => {
    const routerVersion = JSON.parse(await router.version());
    expect(routerVersion.name).to.equal('Router');
    expect(routerVersion.version).to.equal(2);
    expect(routerVersion.deployment).to.equal('20261019-router');
  });

  it('checks new getters', async () => {
    expect(await router.getPermit2()).to.equal(input.Permit2);
    expect(await router.getWeth()).to.equal(input.WETH);
  });

  it('accepts ETH only from WETH', async () => {
    const wethSigner = await impersonate(input.WETH);
    const alice = await getSigner();

    const wethTx = wethSigner.sendTransaction({
      to: router.target,
      value: ethers.parseEther('1.0'),
    });
    await expect(wethTx).to.not.be.reverted;

    const aliceTx = alice.sendTransaction({
      to: router.target,
      value: ethers.parseEther('1.0'),
    });
    await expect(aliceTx).to.be.reverted;
  });
});
