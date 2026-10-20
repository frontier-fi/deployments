# 2026-10-19 Batch Router

Deploys the `BatchRouter`, for complex multi-hop swaps (supports single token add / remove types and buffer wrap / unwrap).

The Vault address comes from `20261016-vault`. WETH and Permit2 are existing contracts and hardcoded in `constants.ts`.

Bytecode is from [74d7068f](https://github.com/balancer/balancer-v3-monorepo/commit/74d7068fb21565741427cdabfa4f1b539a4bddaa).

## Useful files

- [Sepolia addresses](./output/sepolia.json)
- [`BatchRouter` artifact](./artifact/BatchRouter.json)
