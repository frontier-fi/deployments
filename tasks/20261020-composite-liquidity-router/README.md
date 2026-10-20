# 2026-10-20 Composite Liquidity Router

Deployment for `CompositeLiquidityRouter` for complex liquidity operations involving pools with ERC4626 wrappers. Includes allowing individually choosing which tokens to wrap / unwrap for boosted pool operations, as opposed to wrapping / unwrapping automatically. Excludes nested pool operations.

The Vault address comes from `20261016-vault`. WETH and Permit2 are existing contracts and hardcoded in `constants.ts`.

## Useful Files

- [Sepolia addresses](./output/sepolia.json)
- [Code](https://github.com/balancer/balancer-v3-monorepo/commit/68cc540d16270044fc4ac6fbdcb24c2cf4fc87bf).
- [`CompositeLiquidityRouter` artifact](./artifact/CompositeLiquidityRouter.json)
