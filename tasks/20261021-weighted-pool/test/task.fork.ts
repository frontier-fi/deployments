import hre from 'hardhat';
import { expect } from 'chai';
import { Contract, TransactionReceipt } from 'ethers';

import {
  describeForkTest,
  getForkedNetwork,
  MONTH,
  ONES_BYTES32,
  Task,
  TaskMode,
  USDC,
  WETH,
  ZERO_ADDRESS,
} from '@src';

// Block after the last router deployment. Create calls decimals(), so both tokens must already exist.
const FORK_BLOCK = 11956558;
const WEIGHT_80 = 8n * 10n ** 17n;
const WEIGHT_20 = 2n * 10n ** 17n;
const SWAP_FEE = 10n ** 16n; // 1%
const PAUSE_WINDOW = 75n * 12n * BigInt(MONTH);

describeForkTest('WeightedPool', 'sepolia', FORK_BLOCK, function () {
  let task: Task;
  let factory: Contract;
  let tokens: { token: string; tokenType: number; rateProvider: string; paysYieldFees: boolean }[];

  before('run task', async () => {
    task = new Task('20261021-weighted-pool', TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });
    factory = await task.deployedInstance('WeightedPoolFactory');
    tokens = [WETH.sepolia, USDC.sepolia]
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map((token) => ({ token, tokenType: 0, rateProvider: ZERO_ADDRESS, paysYieldFees: false }));
  });

  it('deploys a pool', async () => {
    const receipt = await (
      await factory.create(
        'Mock Weighted Pool',
        'TEST',
        tokens,
        [WEIGHT_80, WEIGHT_20],
        { pauseManager: ZERO_ADDRESS, swapFeeManager: ZERO_ADDRESS, poolCreator: ZERO_ADDRESS },
        SWAP_FEE,
        ZERO_ADDRESS,
        false,
        false,
        ONES_BYTES32
      )
    ).wait();
    await task.instanceAt('WeightedPool', poolAddress(factory, receipt));
  });

  it('checks factory version', async () => {
    const version = JSON.parse(await factory.version());
    expect(version.name).to.equal('WeightedPoolFactory');
    expect(version.version).to.equal(2);
    expect(version.deployment).to.equal('20261021-weighted-pool');
  });

  it('stores a 75 year pause window', async () => {
    expect(await factory.getPauseWindowDuration()).to.equal(PAUSE_WINDOW);
  });
});

function poolAddress(factory: Contract, receipt: TransactionReceipt | null): string {
  if (receipt === null) throw new Error('Pool creation transaction was not mined');
  const factoryAddress = factory.target.toString().toLowerCase();
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== factoryAddress) continue;
    const parsed = factory.interface.parseLog(log);
    if (parsed?.name === 'PoolCreated') return parsed.args.pool;
  }
  throw new Error('PoolCreated was not emitted');
}
