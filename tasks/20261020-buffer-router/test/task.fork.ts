import hre from 'hardhat';
import { expect } from 'chai';
import { Contract, ethers } from 'ethers';

import { AAVE, describeForkTest, getForkedNetwork, getSigner, impersonate, MAX_UINT48, Task, TaskMode } from '@src';
import { BufferRouterDeployment } from '../input';

// Block after the Vault deployment.
const FORK_BLOCK = 11940609;
const aave = AAVE.sepolia;

describeForkTest('BufferRouter', 'sepolia', FORK_BLOCK, function () {
  let task: Task;
  let bufferRouter: Contract;
  let input: BufferRouterDeployment;

  before('run task', async () => {
    task = new Task('20261020-buffer-router', TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });

    input = task.input() as BufferRouterDeployment;
    bufferRouter = await task.deployedInstance('BufferRouter');
  });

  it('checks buffer router version', async () => {
    const bufferRouterVersion = JSON.parse(await bufferRouter.version());
    expect(bufferRouterVersion.name).to.equal('BufferRouter');
    expect(bufferRouterVersion.version).to.equal(1);
    expect(bufferRouterVersion.deployment).to.equal('20261020-buffer-router');
  });

  it('checks router WETH', async () => {
    const wethSigner = await impersonate(input.WETH);
    const alice = await getSigner();

    const wethTx = wethSigner.sendTransaction({
      to: bufferRouter.target,
      value: ethers.parseEther('1.0'),
    });
    await expect(wethTx).to.not.be.reverted;

    const aliceTx = alice.sendTransaction({
      to: bufferRouter.target,
      value: ethers.parseEther('1.0'),
    });
    await expect(aliceTx).to.be.reverted;
  });

  it('tests buffer initialization', async () => {
    const alice = await getSigner();
    const usdc = new ethers.Contract(
      aave.USDC,
      [
        'function approve(address spender, uint256 amount) returns (bool)',
        'function balanceOf(address) view returns (uint256)',
      ],
      alice
    );
    const faucet = new ethers.Contract(
      aave.faucet,
      ['function mint(address token, address to, uint256 amount) returns (uint256)'],
      alice
    );
    // Faucet max is 10000 whole tokens. The vault keeps 1e4 raw units as the minimum buffer supply.
    await faucet.mint(aave.USDC, alice.address, 10000);
    const initBalance = await usdc.balanceOf(alice.address);

    const permit2 = new ethers.Contract(
      input.Permit2,
      ['function approve(address token, address spender, uint160 amount, uint48 expiration)'],
      alice
    );
    await usdc.approve(input.Permit2, initBalance);
    await permit2.approve(aave.USDC, bufferRouter.target, initBalance, MAX_UINT48);

    await bufferRouter.connect(alice).initializeBuffer(aave.staticAUSDC, initBalance, 0, 0);

    const vaultTask = new Task('20261016-vault', TaskMode.READ_ONLY, getForkedNetwork(hre));
    const vault = await vaultTask.deployedInstance('Vault');
    const vaultExtension = await vaultTask.deployedInstance('VaultExtension');
    const extensionEntrypoint = vaultExtension.attach(vault.target.toString()) as Contract;

    expect(await extensionEntrypoint.isERC4626BufferInitialized(aave.staticAUSDC)).to.equal(true);
    expect(await extensionEntrypoint.getERC4626BufferAsset(aave.staticAUSDC)).to.equal(aave.USDC);
  });
});
