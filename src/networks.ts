import fs from 'fs';
import path from 'path';

// The one list of supported networks. `drpc` is dRPC's name for the chain: https://drpc.org/chainlist
export type NetworkInfo = { chainId: number; 'block-explorer': string; drpc: string };

export const SUPPORTED_NETWORKS: Record<string, NetworkInfo> = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../addresses/.supported-networks.json'), 'utf8')
);

// RPC_URL_<NETWORK> (e.g. RPC_URL_BASE) points a network anywhere, such as a local anvil. Otherwise dRPC, with
// DRPC_API_KEY (the CI secret) or DRPC_KEY, or dRPC's free endpoint without a key. The free plan does not cover every
// chain (Sepolia is paid-only), and dRPC says so in its error.
export function rpcUrl(network: string): string {
  const override = process.env[`RPC_URL_${network.toUpperCase()}`];
  if (override) return override;

  const { drpc } = SUPPORTED_NETWORKS[network];
  const key = process.env.DRPC_API_KEY ?? process.env.DRPC_KEY;
  return key ? `https://lb.drpc.live/${drpc}/${key}` : `https://${drpc}.drpc.org`;
}

// Etherscan's v2 API takes one key for every chain.
export function etherscanApiKey(): string | undefined {
  return process.env.ETHERSCAN_API_KEY;
}
