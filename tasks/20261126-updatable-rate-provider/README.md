# 2026-11-26 Updatable Rate Provider Factory

Deployment of `UpdatableRateProviderBalV3Factory` and its child `UpdatableRateProviderBalV3` contract for Balancer V3 Gyro pools. The factory deploys new `UpdatableRateProviderBalV3` instances permissionlessly, tracks bytecode provenance via `isRateProviderFromFactory`, and can be disabled one-way by its owner.

Bytecode is from [`08c97d21`](https://github.com/gyrostable/dynamic-rateprovider/commit/08c97d21d16b11bda9d6316efa8860058156da9d), compiled with `solc 0.8.24+commit.e11b9ed9` using the Foundry settings in `foundry.toml` and Hardhat `outputSelection` / `hh-sol-build-info-1` formatting.

## Useful files

- [`UpdatableRateProviderBalV3Factory` artifact](./artifact/UpdatableRateProviderBalV3Factory.json)
- [`UpdatableRateProviderBalV3` artifact](./artifact/UpdatableRateProviderBalV3.json)
