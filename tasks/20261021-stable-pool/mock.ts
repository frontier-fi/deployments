import { Contract, TransactionReceipt } from 'ethers';

import { NO_POOL_ROLES, sepoliaWethUsdc, SWAP_FEE, ZERO_ADDRESS } from '@src';

export const AMPLIFICATION = 1000n;

export const MOCK_STABLE_POOL = {
  name: 'DO NOT USE - Mock Stable Pool',
  symbol: 'MOCK',
};

export async function createMockStablePool(factory: Contract, salt: string): Promise<TransactionReceipt> {
  const receipt = await (
    await factory.create(
      MOCK_STABLE_POOL.name,
      MOCK_STABLE_POOL.symbol,
      sepoliaWethUsdc(),
      AMPLIFICATION,
      NO_POOL_ROLES,
      SWAP_FEE,
      ZERO_ADDRESS,
      false,
      false,
      salt
    )
  ).wait();
  if (receipt === null) throw new Error('Pool creation transaction was not mined');
  return receipt;
}
