export type UpdatableRateProviderBalV3FactoryDeployment = {
  Owner: string;
  FactoryVersion: string;
  RateProviderVersion: number;
};

const RateProviderVersion = 1;
const BaseVersion = { version: RateProviderVersion, deployment: '20261126-updatable-rate-provider' };

export default {
  FactoryVersion: JSON.stringify({ name: 'UpdatableRateProviderBalV3Factory', ...BaseVersion }),
  RateProviderVersion,
  sepolia: {
    Owner: '0xAD2906fAf5eFEC651f54372b121414FF0EeC6B1D',
  },
  base: {
    Owner: '0xAD2906fAf5eFEC651f54372b121414FF0EeC6B1D',
  },
  ethereum: {
    Owner: '0xAD2906fAf5eFEC651f54372b121414FF0EeC6B1D',
  },
  monad: {
    Owner: '0xAD2906fAf5eFEC651f54372b121414FF0EeC6B1D',
  },
};
