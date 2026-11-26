import { Contract, TransactionReceipt } from 'ethers';

import { gasLimitForDeployedCode, ZERO_ADDRESS } from '@src';

export const MOCK_INITIAL_VALUE = 10n ** 18n;

export async function createMockUpdatableRateProvider(factory: Contract, owner: string): Promise<TransactionReceipt> {
  const args = [ZERO_ADDRESS, false, MOCK_INITIAL_VALUE, owner, ZERO_ADDRESS] as const;
  const gasLimit = await gasLimitForDeployedCode(factory, factory.interface.encodeFunctionData('create', [...args]));
  const receipt = await (await factory.create(...args, { gasLimit })).wait();
  if (receipt === null) throw new Error('Rate provider creation transaction was not mined');
  return receipt;
}
