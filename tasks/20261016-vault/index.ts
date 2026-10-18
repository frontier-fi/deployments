import hre from 'hardhat';
import { keccak256 } from 'ethers';

import { VaultFactoryDeployment } from './input';
import { Task, TaskRunOptions } from '@src';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as VaultFactoryDeployment;

  const vaultFactoryArgs = [
    input.Authorizer,
    input.pauseWindowDuration,
    input.bufferPeriodDuration,
    input.minTradeAmount,
    input.minWrapAmount,
    keccak256(input.vaultCreationCode),
    keccak256(input.vaultExtensionCreationCode),
    keccak256(input.vaultAdminCreationCode),
  ];

  const vaultFactory = await task.deployAndVerify('VaultFactory', vaultFactoryArgs, from, force);

  // Sanity check that the factory was deployed correctly.
  const vaultAddress = await vaultFactory.getDeploymentAddress(input.salt);
  if (vaultAddress !== input.targetVaultAddress) {
    throw Error('Incorrect target address');
  }

  // Deploy the ProtocolFeeController, as it won't be there yet on new chains.
  // Must be AFTER the VaultFactory, or the deployer account nonce will be incorrect.
  const args = [vaultAddress, input.InitialGlobalProtocolSwapFee, input.InitialGlobalProtocolYieldFee];
  const protocolFeeController = await task.deployAndVerify('ProtocolFeeController', args, from, force);

  // Deploy the Vault contracts.
  const deployTransaction = await task.deployFactoryContracts(
    await vaultFactory.create.populateTransaction(
      input.salt,
      vaultAddress,
      protocolFeeController.target.toString(),
      input.vaultCreationCode,
      input.vaultExtensionCreationCode,
      input.vaultAdminCreationCode,
      { gasLimit: await createGasLimit() }
    ),
    ['Vault', 'VaultExtension', 'VaultAdmin'],
    (await vaultFactory.isDeployed(vaultAddress)) === false,
    from,
    force
  );

  const vaultAdminAddress = await vaultFactory.deployedVaultAdmins(vaultAddress);
  const vaultExtensionAddress = await vaultFactory.deployedVaultExtensions(vaultAddress);

  // NOTE: contractsInfo must be sorted by deployment order
  await task.saveAndVerifyFactoryContracts(
    [
      {
        name: 'VaultAdmin',
        expectedAddress: vaultAdminAddress,
        args: [
          vaultAddress,
          input.pauseWindowDuration,
          input.bufferPeriodDuration,
          input.minTradeAmount,
          input.minWrapAmount,
        ],
      },
      {
        name: 'VaultExtension',
        expectedAddress: vaultExtensionAddress,
        args: [vaultAddress, vaultAdminAddress],
      },
      {
        name: 'Vault',
        expectedAddress: vaultAddress,
        args: [vaultExtensionAddress, input.Authorizer, protocolFeeController.target.toString()],
      },
    ],
    deployTransaction
  );
};

// Glamsterdam charges code deposit from a state-gas reservoir, which is only the
// part of the gas limit above the 16,777,216 execution cap. 120e6 covers the
// three Vault runtimes. yarn test runs in Hardhat, whose schedule is still the
// old one and which rejects a limit above that cap, so it keeps 15e6.
async function createGasLimit(): Promise<number> {
  if (hre.network.name === 'hardhat') return 15e6;

  const block = (await hre.network.provider.request({
    method: 'eth_getBlockByNumber',
    params: ['latest', false],
  })) as { blockAccessListHash?: string | null };

  return block?.blockAccessListHash ? 120e6 : 15e6;
}
