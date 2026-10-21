# 2026-10-20 Stable Pool

Deployment of the `StablePoolFactory`. Pools from this factory use stable math, inspired by Curve stable pools, which is best suited for correlated assets.

The pause window is 4 years. This factory does not allow setting a pool creator on pool deployment.

The Vault address comes from `20261016-vault`.

Bytecode is from [25d73b3d](https://github.com/balancer/balancer-v3-monorepo/commit/25d73b3d091f5dde943ad6b7d90db9569222510d).

## Useful files

- [Sepolia addresses](./output/sepolia.json)
- [`StablePoolFactory` artifact](./artifact/StablePoolFactory.json)
- [`StablePool` artifact](./artifact/StablePool.json)
