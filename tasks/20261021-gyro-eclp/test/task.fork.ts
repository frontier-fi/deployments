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
const SWAP_FEE = 10n ** 16n; // 1%
const PAUSE_WINDOW = 75n * 12n * BigInt(MONTH);

// Parameters from mainnet pool 0x2191df821c198600499aa1f0031b1a7514d7a7d9.
const eclpParams = {
  alpha: 998502246630054917n,
  beta: 1000200040008001600n,
  c: 707106781186547524n,
  s: 707106781186547524n,
  lambda: 4000000000000000000000n,
};
const derivedEclpParams = {
  tauAlpha: { x: -94861212813096057289512505574275160547n, y: 31644119574235279926451292677567331630n },
  tauBeta: { x: 37142269533113549537591131345643981951n, y: 92846388265400743995957747409218517601n },
  u: 66001741173104803338721745994955553010n,
  v: 62245253919818011890633399060291020887n,
  w: 30601134345582732000058913853921008022n,
  z: -28859471639991253843240999485797747790n,
  dSq: 99999999999999999886624093342106115200n,
};

describeForkTest('GyroECLPPool', 'sepolia', FORK_BLOCK, function () {
  let task: Task;
  let factory: Contract;
  let tokens: { token: string; tokenType: number; rateProvider: string; paysYieldFees: boolean }[];

  before('run task', async () => {
    task = new Task('20261021-gyro-eclp', TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });
    factory = await task.deployedInstance('GyroECLPPoolFactory');
    tokens = [WETH.sepolia, USDC.sepolia]
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map((token) => ({ token, tokenType: 0, rateProvider: ZERO_ADDRESS, paysYieldFees: false }));
  });

  it('deploys a pool', async () => {
    const receipt = await (
      await factory.create(
        'Mock Gyro E-CLP',
        'TEST',
        tokens,
        eclpParams,
        derivedEclpParams,
        { pauseManager: ZERO_ADDRESS, swapFeeManager: ZERO_ADDRESS, poolCreator: ZERO_ADDRESS },
        SWAP_FEE,
        ZERO_ADDRESS,
        false,
        false,
        ONES_BYTES32
      )
    ).wait();
    await task.instanceAt('GyroECLPPool', poolAddress(factory, receipt));
  });

  it('checks factory version', async () => {
    const version = JSON.parse(await factory.version());
    expect(version.name).to.equal('GyroECLPPoolFactory');
    expect(version.version).to.equal(2);
    expect(version.deployment).to.equal('20261021-gyro-eclp');
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
