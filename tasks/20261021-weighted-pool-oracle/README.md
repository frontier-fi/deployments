# 2026-10-21 Weighted Pool Oracle

Deployment of `WeightedLPOracle` and its corresponding `WeightedLPOracleFactory`. These contracts provide a manipulation-resistant mechanism to compute the market price of LP tokens from weighted pools given market price feeds for each of the tokens registered in the pool.

This version enables a flag which, when set on oracle deployment, makes all TVL-related calls revert when the Vault is unlocked. This is one strategy for preventing manipulations on the lending protocol side through the "infinite BPT mint" available during transient operations, in case the lending protocol does not have any caps imposed natively. It also increases price stability by rounding more consistently in the TVL calculation.

Additionally, it provides sequencer uptime grace periods (1 hour) for L2 networks that rely on them. Sepolia leaves the sequencer feed unset.

The Vault address comes from `20261016-vault`.

Bytecode is from [c1cd3696](https://github.com/balancer/balancer-v3-monorepo/commit/c1cd3696c3627bfe93f66f6aa175b9ad894c3e4a).

## Useful files

- [`WeightedLPOracleFactory` artifact](./artifact/WeightedLPOracleFactory.json)
- [`WeightedLPOracle` artifact](./artifact/WeightedLPOracle.json)
