import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import { describeForkTest, getForkedNetwork, impersonate, Task, TaskMode } from '@src';
import { VaultFactoryDeployment } from '../input';

// Block after the Authorizer deployment, so the deployer nonce is 1.
const FORK_BLOCK = 11926270;

describeForkTest('Vault', 'sepolia', FORK_BLOCK, function () {
  let task: Task;
  let vault: Contract;
  let vaultExtension: Contract;
  let vaultAdmin: Contract;
  let protocolFeeController: Contract;
  let input: VaultFactoryDeployment;

  before('run task', async () => {
    task = new Task('20261016-vault', TaskMode.TEST, getForkedNetwork(hre));
    input = task.input() as VaultFactoryDeployment;
    const deployer: SignerWithAddress = await impersonate(input.deployer);
    await task.run({ force: true, from: deployer });

    vault = await task.deployedInstance('Vault');
    vaultExtension = await task.deployedInstance('VaultExtension');
    vaultAdmin = await task.deployedInstance('VaultAdmin');
    protocolFeeController = await task.deployedInstance('ProtocolFeeController');
  });

  it('checks vault address', async () => {
    expect(vault.target.toString()).to.equal(input.targetVaultAddress);
  });

  it('checks admin reference', async () => {
    expect(await vaultAdmin.vault()).to.equal(vault.target.toString());
  });

  it('checks extension reference', async () => {
    expect(await vaultExtension.vault()).to.equal(vault.target.toString());
  });

  it('checks protocol fee controller reference', async () => {
    const vaultAsExtension = vaultExtension.attach(vault.target.toString()) as Contract;
    expect(await vaultAsExtension.getProtocolFeeController()).to.equal(protocolFeeController.target.toString());
  });

  it('checks initial protocol fees', async () => {
    expect(await protocolFeeController.getGlobalProtocolSwapFeePercentage()).to.equal(
      input.InitialGlobalProtocolSwapFee
    );
    expect(await protocolFeeController.getGlobalProtocolYieldFeePercentage()).to.equal(
      input.InitialGlobalProtocolYieldFee
    );
  });

  it('checks vaultAdmin constants', async () => {
    expect(await vaultAdmin.getMinimumTradeAmount()).to.equal(BigInt(input.minTradeAmount));
    expect(await vaultAdmin.getMinimumWrapAmount()).to.equal(BigInt(input.minWrapAmount));
    expect(await vaultAdmin.getMinimumPoolTokens()).to.equal(2n);
    expect(await vaultAdmin.getMaximumPoolTokens()).to.equal(8n);
    expect(await vaultAdmin.getPauseWindowEndTime()).to.equal(await fromNow(input.pauseWindowDuration));
    expect(await vaultAdmin.getBufferPeriodDuration()).to.equal(BigInt(input.bufferPeriodDuration));
    expect(await vaultAdmin.getBufferPeriodEndTime()).to.equal(
      await fromNow(input.pauseWindowDuration + input.bufferPeriodDuration)
    );
  });

  it('checks extension', async () => {
    expect(await vault.getVaultExtension()).to.equal(vaultExtension.target.toString());
  });

  it('checks admin', async () => {
    expect(await vaultExtension.getVaultAdmin()).to.equal(vaultAdmin.target.toString());
  });
});

async function fromNow(seconds: number): Promise<bigint> {
  const block = await hre.ethers.provider.getBlock('latest');
  if (block === null) throw new Error('No latest block');
  return BigInt(block.timestamp) + BigInt(seconds);
}
