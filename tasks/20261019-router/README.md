# 2026-10-19 Router

Deploys Router for basic, single step operations (e.g., pool initialization, add, remove, swap). This version saves the sender (i.e., uses the saveSender modifier) on initialization as well as on add liquidity operations, enabling pools to verify the sender on liquidity operations (e.g., to enforce a single-LP, as in liquidity bootstrapping or treasury management pools).

The Vault address comes from `20261016-vault`. WETH and Permit2 are existing contracts and hardcoded in `constants.ts`.

Bytecode is from [577b86c7](https://github.com/balancer/balancer-v3-monorepo/commit/577b86c7aec06c01e5f57bf20d4a0f728ce249b2).

## Useful files

- [`Router` artifact](./artifact/Router.json)
