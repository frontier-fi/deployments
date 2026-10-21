# 2026-10-20 Weighted Pool

Deployment of the `WeightedPoolFactory`. Pools from this factory use weighted math, which is best suited for uncorrelated assets (full price range).

This version contains stability improvements and a larger pause window (75 years). Allows setting a pool creator on pool deployment.

The Vault address comes from `20261016-vault`.

Bytecode is from [6c37baf5](https://github.com/balancer/balancer-v3-monorepo/commit/6c37baf5d9efdc21c167e30fd6928446d717ab6e).

## Useful files

- [Sepolia addresses](./output/sepolia.json)
- [`WeightedPoolFactory` artifact](./artifact/WeightedPoolFactory.json)
- [`WeightedPool` artifact](./artifact/WeightedPool.json)
