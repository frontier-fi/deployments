import { Contract, TransactionReceipt } from 'ethers';

import { gasLimitForDeployedCode, NO_POOL_ROLES, sepoliaWethUsdc, SWAP_FEE, ZERO_ADDRESS } from '@src';

export const MOCK_WEIGHTED_POOL = {
  name: 'DO NOT USE - Mock Weighted Pool',
  symbol: 'MOCK',
  normalizedWeights: [8n * 10n ** 17n, 2n * 10n ** 17n],
};

export async function createMockWeightedPool(factory: Contract, salt: string): Promise<TransactionReceipt> {
  const args = [
    MOCK_WEIGHTED_POOL.name,
    MOCK_WEIGHTED_POOL.symbol,
    sepoliaWethUsdc(),
    MOCK_WEIGHTED_POOL.normalizedWeights,
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
