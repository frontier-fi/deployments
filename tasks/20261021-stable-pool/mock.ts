import { Contract, TransactionReceipt } from 'ethers';

import { gasLimitForDeployedCode, NO_POOL_ROLES, sepoliaWethUsdc, SWAP_FEE, ZERO_ADDRESS } from '@src';

export const AMPLIFICATION = 1000n;

export const MOCK_STABLE_POOL = {
  name: 'DO NOT USE - Mock Stable Pool',
  symbol: 'MOCK',
};

export async function createMockStablePool(factory: Contract, salt: string): Promise<TransactionReceipt> {
  const args = [
    MOCK_STABLE_POOL.name,
    MOCK_STABLE_POOL.symbol,
    sepoliaWethUsdc(),
    AMPLIFICATION,
    NO_POOL_ROLES,
    SWAP_FEE,
    ZERO_ADDRESS,
    false,
    false,
    salt,
  ] as const;
  const gasLimit = await gasLimitForDeployedCode(factory, factory.interface.encodeFunctionData('create', [...args]));
  const receipt = await (await factory.create(...args, { gasLimit })).wait();
  if (receipt === null) throw new Error('Pool creation transaction was not mined');
  return receipt;
}
