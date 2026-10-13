import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import { impersonateAccount, setBalance as setAccountBalance } from '@nomicfoundation/hardhat-network-helpers';

const DEFAULT_IMPERSONATION_BALANCE = 100n * 10n ** 18n;

export async function getSigners(): Promise<SignerWithAddress[]> {
  const { ethers } = await import('hardhat');
  return ethers.getSigners() as unknown as SignerWithAddress[];
}

export async function getSigner(index = 0): Promise<SignerWithAddress> {
  return (await getSigners())[index];
}

export async function impersonate(address: string, balance = DEFAULT_IMPERSONATION_BALANCE): Promise<SignerWithAddress> {
  await impersonateAccount(address);
  await setBalance(address, balance);

  const { ethers } = await import('hardhat');
  return await ethers.provider.getSigner(address);
}

export async function setBalance(address: string, balance: bigint): Promise<void> {
  await setAccountBalance(address, balance);
}
