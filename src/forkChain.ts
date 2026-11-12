import { HardhatNetworkConfig, HardhatRuntimeEnvironment } from 'hardhat/types';

import { SUPPORTED_NETWORKS } from './networks';
import { Network } from './types';

export function chainIdOf(network: Network): number {
  const entry = SUPPORTED_NETWORKS[network];
  if (!entry) throw new Error(`No chain id for ${network} in addresses/.supported-networks.json`);
  return entry.chainId;
}

// Hardhat's in-process network reports chain id 31337 unless told otherwise, and a fork does not change that.
// Contracts that read block.chainid (pool factory CREATE2 salts, EIP-712 domains) then diverge from the live chain.
// The provider reads the chain id once, when it is created, so this must run before the first request in the process.
export function useForkChainId(hre: HardhatRuntimeEnvironment, network: Network): void {
  (hre.config.networks.hardhat as HardhatNetworkConfig).chainId = chainIdOf(network);
}

export async function assertForkChainId(hre: HardhatRuntimeEnvironment, network: Network): Promise<void> {
  const actual = Number(await hre.network.provider.send('eth_chainId', []));
  const expected = chainIdOf(network);
  if (actual !== expected) {
    throw new Error(
      `Fork of ${network} runs as chain ${actual}, expected ${expected}. The provider was created before ` +
        `useForkChainId; fork one network per process.`
    );
  }
}
