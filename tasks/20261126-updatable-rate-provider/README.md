# 2026-11-26 Updatable Rate Provider Factory

Deployment of `UpdatableRateProviderBalV3Factory` and its child `UpdatableRateProviderBalV3` contract for Balancer V3 Gyro pools. The factory deploys new `UpdatableRateProviderBalV3` instances permissionlessly, tracks bytecode provenance via `isRateProviderFromFactory`, and can be disabled one-way by its owner.

Bytecode is from [`08c97d21`](https://github.com/gyrostable/dynamic-rateprovider/commit/08c97d21d16b11bda9d6316efa8860058156da9d). To reproduce `build-info`, run `forge build --build-info src/UpdatableRateProviderBalV3Factory.sol` in that repository, copy the generated file from `out/build-info/` into `build-info/`, and run `yarn foundry2hh --task 20261126-updatable-rate-provider`.

## Useful files

- [`UpdatableRateProviderBalV3Factory` artifact](./artifact/UpdatableRateProviderBalV3Factory.json)
- [`UpdatableRateProviderBalV3` artifact](./artifact/UpdatableRateProviderBalV3.json)
