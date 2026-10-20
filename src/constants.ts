import { Network } from './types';

// Canonical Permit2. Same address on every chain except for zkSync.
// https://developers.uniswap.org/docs/protocols/permit2/overview
export const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

// WETH is a different contract on each chain.
export const WETH: Record<Network, string> = {
  sepolia: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
};

// Aave v3. The static aToken is the ERC4626 whose asset is Aave USDC.
// The faucet mints the underlying. https://aave.com/docs/aave-v3/smart-contracts/testing-and-debugging
export const AAVE: Record<Network, { USDC: string; staticAUSDC: string; faucet: string }> = {
  sepolia: {
    USDC: '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8',
    staticAUSDC: '0x8A88124522dbBF1E56352ba3DE1d9F78C143751e',
    faucet: '0xC959483DBa39aa9E78757139af0e9a2EDEb3f42D',
  },
};

// Spread into a task input. The loader merges `input[network]` over the shared fields.
export function wethByNetwork(): Record<Network, { WETH: string }> {
  return Object.fromEntries(Object.entries(WETH).map(([network, address]) => [network, { WETH: address }])) as Record<
    Network,
    { WETH: string }
  >;
}
