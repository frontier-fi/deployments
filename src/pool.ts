import { Contract, TransactionReceipt } from 'ethers';

import { USDC, WETH, ZERO_ADDRESS } from './constants';

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

// Sepolia WETH and Circle USDC, sorted by address. create() calls decimals() on both.
export function sepoliaWethUsdc(): PoolTokenConfig[] {
  return [WETH.sepolia, USDC.sepolia]
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((token) => ({ token, tokenType: 0, rateProvider: ZERO_ADDRESS, paysYieldFees: false }));
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
