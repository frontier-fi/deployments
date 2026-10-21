import { Contract, TransactionReceipt } from 'ethers';

import { NO_POOL_ROLES, sepoliaWethUsdc, SWAP_FEE, ZERO_ADDRESS } from '@src';

// Parameters from mainnet pool 0x2191df821c198600499aa1f0031b1a7514d7a7d9.
export const eclpParams = {
  alpha: 998502246630054917n,
  beta: 1000200040008001600n,
  c: 707106781186547524n,
  s: 707106781186547524n,
  lambda: 4000000000000000000000n,
};
export const derivedEclpParams = {
  tauAlpha: { x: -94861212813096057289512505574275160547n, y: 31644119574235279926451292677567331630n },
  tauBeta: { x: 37142269533113549537591131345643981951n, y: 92846388265400743995957747409218517601n },
  u: 66001741173104803338721745994955553010n,
  v: 62245253919818011890633399060291020887n,
  w: 30601134345582732000058913853921008022n,
  z: -28859471639991253843240999485797747790n,
  dSq: 99999999999999999886624093342106115200n,
};

export const MOCK_GYRO_ECLP_POOL = {
  name: 'DO NOT USE - Mock Gyro ECLP Pool',
  symbol: 'MOCK',
};

export async function createMockGyroEclpPool(factory: Contract, salt: string): Promise<TransactionReceipt> {
  const receipt = await (
    await factory.create(
      MOCK_GYRO_ECLP_POOL.name,
      MOCK_GYRO_ECLP_POOL.symbol,
      sepoliaWethUsdc(),
      eclpParams,
      derivedEclpParams,
      NO_POOL_ROLES,
      SWAP_FEE,
      ZERO_ADDRESS,
      false,
      false,
      salt
    )
  ).wait();
  if (receipt === null) throw new Error('Pool creation transaction was not mined');
  return receipt;
}
