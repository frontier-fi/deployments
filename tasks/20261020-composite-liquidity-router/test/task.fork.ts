import hre from 'hardhat';
import { expect } from 'chai';
import { Contract, ethers } from 'ethers';

import { describeForkTest, getForkedNetwork, getSigner, impersonate, Task, TaskMode } from '@src';

// Block after the Vault deployment.
const FORK_BLOCK = 11940609;

describeForkTest('CompositeLiquidityRouter', 'sepolia', FORK_BLOCK, function () {
  let task: Task;
  let compositeLiquidityRouter: Contract;

  before('run task', async () => {
    task = new Task('20261020-composite-liquidity-router', TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });

    compositeLiquidityRouter = await task.deployedInstance('CompositeLiquidityRouter');
  });

  it('checks composite liquidity router version', async () => {
    const compositeLiquidityRouterVersion = JSON.parse(await compositeLiquidityRouter.version());
    expect(compositeLiquidityRouterVersion.name).to.equal('CompositeLiquidityRouter');
    expect(compositeLiquidityRouterVersion.version).to.equal(2);
    expect(compositeLiquidityRouterVersion.deployment).to.equal('20261020-composite-liquidity-router');
  });

  it('checks composite liquidity router WETH', async () => {
    const wethSigner = await impersonate(task.input().WETH as string);
    const alice = await getSigner();

    const wethTx = wethSigner.sendTransaction({
      to: compositeLiquidityRouter.target,
      value: ethers.parseEther('1.0'),
    });
    await expect(wethTx).to.not.be.reverted;

    const aliceTx = alice.sendTransaction({
      to: compositeLiquidityRouter.target,
      value: ethers.parseEther('1.0'),
    });
    await expect(aliceTx).to.be.reverted;
  });
});
