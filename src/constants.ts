import { Network } from './types';

// Canonical Permit2. Same address on every chain except for zkSync.
// https://developers.uniswap.org/docs/protocols/permit2/overview
export const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

// WETH is a different contract on each chain.
export const WETH: Record<Network, string> = {
  sepolia: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
};

// Spread into a task input. The loader merges `input[network]` over the shared fields.
export function wethByNetwork(): Record<Network, { WETH: string }> {
  return Object.fromEntries(Object.entries(WETH).map(([network, address]) => [network, { WETH: address }])) as Record<
    Network,
    { WETH: string }
  >;
}
