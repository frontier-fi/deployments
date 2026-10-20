import fs from 'fs';
import path from 'path';

const ADDRESSES_DIR = path.resolve(__dirname, '../addresses');
const LOOKUP_FILE = '_lookup.json';

type Deployment = {
  contracts: { name: string; address: string }[];
  status: string;
};

type Lookup = Record<string, Record<string, Record<string, Record<string, string>>>>;

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

const lookup: Lookup = {};

for (const fileName of fs.readdirSync(ADDRESSES_DIR).sort()) {
  if (!fileName.endsWith('.json') || fileName.startsWith('.') || fileName === LOOKUP_FILE) {
    continue;
  }

  const network = fileName.slice(0, -'.json'.length);
  const deployments = readJson<Record<string, Deployment>>(path.join(ADDRESSES_DIR, fileName));
  const byStatus: Lookup[string] = {};

  for (const [task, deployment] of Object.entries(deployments)) {
    const contracts: Record<string, string> = {};
    for (const contract of deployment.contracts) {
      contracts[contract.name] = contract.address;
    }
    byStatus[deployment.status] = { ...byStatus[deployment.status], [task]: contracts };
  }

  lookup[network] = byStatus;
}

fs.writeFileSync(path.join(ADDRESSES_DIR, LOOKUP_FILE), JSON.stringify(lookup, null, 2));
