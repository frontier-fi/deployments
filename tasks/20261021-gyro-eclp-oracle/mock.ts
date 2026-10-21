import { Contract, TransactionReceipt } from 'ethers';

import { CONSTANT_PRICE_FEED } from '@src';

export const MOCK_ECLP_ORACLE_FEEDS = [CONSTANT_PRICE_FEED.sepolia, CONSTANT_PRICE_FEED.sepolia];

export async function createMockEclpOracle(
  factory: Contract,
  pool: string,
  shouldUseBlockTimeForOldestFeedUpdate: boolean,
  shouldRevertIfVaultUnlocked: boolean
): Promise<TransactionReceipt> {
  const receipt = await (
    await factory.create(
      pool,
      shouldUseBlockTimeForOldestFeedUpdate,
      shouldRevertIfVaultUnlocked,
      MOCK_ECLP_ORACLE_FEEDS
    )
  ).wait();
  if (receipt === null) throw new Error('Oracle creation transaction was not mined');
  return receipt;
}
