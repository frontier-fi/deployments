import { Network } from './types';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// The account behind every deployment in this repo. Deployer-created addresses match across networks only while it
// uses the same nonces on each (see yarn rehearse).
export const DEPLOYER = '0xe7691e2764b4f4cB77Bc8380E16b66e4cDFbFf8b';

export const ONES_BYTES32 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

export const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

// 30-day month. Pause windows are counted in these.
export const MONTH = 30 * 24 * 60 * 60;

export const HOUR = 60 * 60;

// Canonical Permit2. Same address on every chain except for zkSync.
// https://developers.uniswap.org/docs/protocols/permit2/overview
export const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

// Permit2 stores the allowance expiry as a uint48. Max means the approval does not expire.
export const MAX_UINT48 = (1n << 48n) - 1n;

// WETH is a different contract on each chain. On Monad it is WMON.
export const WETH: Record<Network, string> = {
  sepolia: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
  base: '0x4200000000000000000000000000000000000006',
  ethereum: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  monad: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A',
};

// Circle USDC. Distinct from the Aave test USDC.
export const USDC: Record<Network, string> = {
  sepolia: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  monad: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603',
};

// Balancer's constant price feed, from its 20250813-v3-constant-price-feed task. It always returns 1, which is
// enough for a mock oracle.
export const CONSTANT_PRICE_FEED: Record<Network, string> = {
  sepolia: '0x1074d0962656768E2b97a0ce39d8c6CCcfBb73b3',
  base: '0x1CD776897ef4f647bf8241Ec69549e4A9cb1D608',
  ethereum: '0x99364f84d1C68d87aEAD0CE92eB47409A0C52c58',
  monad: '0x5DbAd78818D4c8958EfF2d5b95b28385A22113Cd',
};

// Chainlink L2 sequencer uptime feed. Sepolia, Ethereum and Monad have none.
export const SEQUENCER_UPTIME_FEED: Record<Network, string> = {
  sepolia: ZERO_ADDRESS,
  base: '0xBCF85224fc0756B9Fa45aA7892530B47e10b6433',
  ethereum: ZERO_ADDRESS,
  monad: ZERO_ADDRESS,
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
  return byNetwork('WETH', WETH);
}

// Spread into a task input, like wethByNetwork.
export function sequencerUptimeFeedByNetwork(): Record<Network, { SequencerUptimeFeed: string }> {
  return byNetwork('SequencerUptimeFeed', SEQUENCER_UPTIME_FEED);
}

function byNetwork<K extends string>(key: K, values: Record<Network, string>): Record<Network, Record<K, string>> {
  return Object.fromEntries(
    Object.entries(values).map(([network, value]) => [network, { [key]: value } as Record<K, string>])
  ) as Record<Network, Record<K, string>>;
}
