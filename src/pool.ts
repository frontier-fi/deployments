import { Contract, TransactionReceipt } from 'ethers';

import { CONSTANT_PRICE_FEED, USDC, WETH, ZERO_ADDRESS } from './constants';
import { Network } from './types';

export const SWAP_FEE = 10n ** 16n; // 1%

export const NO_POOL_ROLES = {
  pauseManager: ZERO_ADDRESS,
  swapFeeManager: ZERO_ADDRESS,
  poolCreator: ZERO_ADDRESS,
};

export type PoolTokenConfig = {
  token: string;
  tokenType: number;
  rateProvider: string;
  paysYieldFees: boolean;
};

// WETH and Circle USDC, sorted by address. create() calls decimals() on both.
export function wethUsdc(network: Network): PoolTokenConfig[] {
  return [WETH[network], USDC[network]]
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((token) => ({ token, tokenType: 0, rateProvider: ZERO_ADDRESS, paysYieldFees: false }));
}

// One constant feed per token of the wethUsdc() pool.
export function mockOracleFeeds(network: Network): string[] {
  return [CONSTANT_PRICE_FEED[network], CONSTANT_PRICE_FEED[network]];
}

export function createdAddress(
  factory: Contract,
  receipt: TransactionReceipt | null,
  eventName: string,
  argName: string
): string {
  if (receipt === null) throw new Error('Transaction was not mined');
  const factoryAddress = factory.target.toString().toLowerCase();
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== factoryAddress) continue;
    const parsed = factory.interface.parseLog(log);
    if (parsed?.name === eventName) return parsed.args[argName];
  }
  throw new Error(`${eventName} was not emitted`);
}

export function poolCreatedAddress(factory: Contract, receipt: TransactionReceipt | null): string {
  return createdAddress(factory, receipt, 'PoolCreated', 'pool');
}
