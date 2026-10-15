# 2026-10-13 Authorizer

Access control for the protocol. An account can perform an action when it holds the role with that action id. `canPerform` ignores the `where` argument. The admin in `input.ts` is granted `DEFAULT_ADMIN_ROLE` and can grant or revoke roles.

The source is [`Authorizer.sol` at `1b23f229`](https://github.com/balancer/balancer-v2-monorepo/blob/1b23f2290b2d7d22ba7187f7e4b2c613316cbb03/contracts/vault/Authorizer.sol).

## Useful files

- [`Authorizer` artifact](./artifact/Authorizer.json)

Sepolia addresses are written to `output/sepolia.json` when the task is deployed.
