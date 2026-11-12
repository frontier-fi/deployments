import { Contract, TransactionReceipt } from 'ethers';

import { gasLimitForDeployedCode, Network, mockOracleFeeds } from '@src';

export async function createMockEclpOracle(
  factory: Contract,
  network: Network,
  pool: string,
  shouldUseBlockTimeForOldestFeedUpdate: boolean,
  shouldRevertIfVaultUnlocked: boolean
): Promise<TransactionReceipt> {
  const feeds = mockOracleFeeds(network);
  const gasLimit = await gasLimitForDeployedCode(
    factory,
    factory.interface.encodeFunctionData('create', [
      pool,
      shouldUseBlockTimeForOldestFeedUpdate,
      shouldRevertIfVaultUnlocked,
      feeds,
    ])
  );
  const receipt = await (
    await factory.create(pool, shouldUseBlockTimeForOldestFeedUpdate, shouldRevertIfVaultUnlocked, feeds, { gasLimit })
  ).wait();
  if (receipt === null) throw new Error('Oracle creation transaction was not mined');
  return receipt;
}
