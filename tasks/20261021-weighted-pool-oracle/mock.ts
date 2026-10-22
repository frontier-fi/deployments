import { Contract, TransactionReceipt } from 'ethers';

import { CONSTANT_PRICE_FEED, gasLimitForDeployedCode } from '@src';

export const MOCK_WEIGHTED_ORACLE_FEEDS = [CONSTANT_PRICE_FEED.sepolia, CONSTANT_PRICE_FEED.sepolia];

export async function createMockWeightedOracle(
  factory: Contract,
  pool: string,
  shouldUseBlockTimeForOldestFeedUpdate: boolean,
  shouldRevertIfVaultUnlocked: boolean
): Promise<TransactionReceipt> {
  const gasLimit = await gasLimitForDeployedCode(
    factory,
    factory.interface.encodeFunctionData('create', [
      pool,
      shouldUseBlockTimeForOldestFeedUpdate,
      shouldRevertIfVaultUnlocked,
      MOCK_WEIGHTED_ORACLE_FEEDS,
    ])
  );
  const receipt = await (
    await factory.create(
      pool,
      shouldUseBlockTimeForOldestFeedUpdate,
      shouldRevertIfVaultUnlocked,
      MOCK_WEIGHTED_ORACLE_FEEDS,
      { gasLimit }
    )
  ).wait();
  if (receipt === null) throw new Error('Oracle creation transaction was not mined');
  return receipt;
}
