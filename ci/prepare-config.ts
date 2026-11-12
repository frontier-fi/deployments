import path from 'path';
import { homedir } from 'os';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';

const HH_CONFIG_FILENAME = `${homedir()}/.hardhat/networks.json`;
const SUPPORTED_NETWORKS_FILENAME = path.resolve(__dirname, '../addresses/.supported-networks.json');

// dRPC names a chain by its own short name. Only list networks whose name here differs.
// https://drpc.org/chainlist
const DRPC_NETWORK_NAMES: Record<string, string> = {};

if (process.env.CI) {
  const key = process.env.DRPC_API_KEY;
  if (!key) throw new Error('DRPC_API_KEY is not set');

  const supported = Object.keys(JSON.parse(readFileSync(SUPPORTED_NETWORKS_FILENAME, 'utf8')));
  const networks = Object.fromEntries(
    supported.map((network) => [
      network,
      { url: `https://lb.drpc.live/${DRPC_NETWORK_NAMES[network] ?? network}/${key}` },
    ])
  );

  const content = {
    networks,
    defaultConfig: {
      gasPrice: 'auto',
      gasMultiplier: 1,
      accounts: [],
    },
  };

  mkdirSync(path.dirname(HH_CONFIG_FILENAME), { recursive: true });
  writeFileSync(HH_CONFIG_FILENAME, JSON.stringify(content, null, 2));
}
