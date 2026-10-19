# Deployment framework

Task runner for deploying contracts and recording their addresses. Each deployment is a task: build info, inputs, a deploy script, artifacts, and per-network outputs.

Active tasks go in `tasks/`, one-off scripts in `scripts/`, and replaced tasks in `deprecated/`. How to add and run one is in [DEPLOYING.md](DEPLOYING.md).

Configured networks:

- `sepolia` (chain id 11155111)

## Active Deployments

| Description                                   | Task ID                                                  |
| --------------------------------------------- | -------------------------------------------------------- |
| Authorizer, access control                    | [`20261013-authorizer`](./tasks/20261013-authorizer)     |
| Vault, with factory and ProtocolFeeController | [`20261016-vault`](./tasks/20261016-vault)               |
| Router                                        | [`20261019-router`](./tasks/20261019-router)             |
| Batch Router                                  | [`20261019-batch-router`](./tasks/20261019-batch-router) |

## Scripts

| Description | Task ID |
| ----------- | ------- |

## Deprecated Deployments

| Description | Task ID |
| ----------- | ------- |
