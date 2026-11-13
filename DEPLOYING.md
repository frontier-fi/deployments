# Deploying Contracts

This repo aims to provide a robust mechanism to run and verify deployments on multiple networks. This document describes the rationale, what guarantees it provides, and how to create and run deployments.

## Overview

Each deployment unit is called a 'task'. Tasks have a unique ID, which is often prefixed with the date on which they were first executed (to e.g. differentiate the April 2021 deployment of Weighted Pools from the one deployed in July 2022, which might have wildly different behavior).

A task is made up of multiple components:

- one or multiple build information JSON files, located in the `build-info` directory.
- an `input.ts` file, containing information on dependencies and deployment parameters (which might differ across networks).
- an `index.ts` file, with the instructions for the actual deployment.
- the `artifact` directory, with JSON files extracted from the build information containing contracts' ABI, bytecode, and metadata.
- the `output` directory, with JSON files containing the deployment addresses of the tasks' contracts on each network.
- optional fork tests in the `test` directory.

### Why `build-info`

When Hardhat compiles a Solidity project, in addition to the traditional contract artifacts it also produces a special file in the `artifacts/build-info` directory, which includes all of the compilation inputs (full source code, compiler version and settings, etc.) and all of the compilation outputs (creation bytecode, ABI, AST, etc.). By storing this file in the repository and using it as the source of truth for deployments, we fully break the dependency on the source code and are able to modify it and update it after a deployment is created, while guaranteeing that all deployments of a given task will be identical (since they share the same build information).

As part of our development process, we frequently alter the source code of contracts that have already been deployed, and keep no historical versions: the deployment data is fully stored in the build information file.

## Creating Tasks

To create a new task, these are the recommended steps:

- Create a new directory named after the task ID in `tasks/`
- Add an entry in the README file with the new task
- Write appropriate `input.ts` and `index.ts` files, which specify deployment arguments and steps respectively
- Populate `build-info` directory with compiled contracts data (see [Generating build info](#generating-build-info) section)
- Generate artifacts with ABI and bytecode from build info files (see [Generating ABI and bytecode files](#generating-artifact-files-with-abi-and-bytecode) section)

Inputs and task instructions are plain TypeScript files that call appropriate functions - there's no DSL. The recommended way to write them is to copy the structure from the `input.ts` and `index.ts` files from a similar task, and then edit those as needed.
The `output` and `artifact` directories will be automatically generated and populated.

### Generating build info

Build information comes from the contracts repository; this repo compiles nothing. Generate it there on a clean commit, so that it can be verified by other parties: delete the `artifacts` directory and run `yarn hardhat compile` for a clean compilation. The file will then be located at `artifacts/build-info`, and it'll contain the data for all the contracts in that workspace.

### Generating artifact files with ABI and bytecode

To generate the artifacts from build info files:

- Copy the generated build info `json` from the contracts repository's `artifacts/build-info` to `tasks/<task-id>/build-info`.
- From this repo, run the `extract-artifacts` task with the task ID. It copies the ABI and bytecode out of the build info's compiler output, so it does not depend on any compiler setting here.

Without `--name`, each build info file name is taken as the contract name, or `build-info-aliases.json` in the task maps contract names to files. A build info file named by its hash needs `--name` and `--file`:

```
yarn extract-artifacts --id 20261013-authorizer --name Authorizer --file db00c8e4bd40bb1bdee56c8a10243a74
```

The `artifact` folder should have been populated with the created artifacts at this point.

### Vyper Compilation

Hardhat does not generate build information for Vyper contracts - those must be created manually.

## Verifying Tasks

There are three things to verify from a task:

- the build information
- the inputs
- the deployment script

The last two can be performed with simple manual inspection, that is, reviewing `input.ts` and `index.ts` and checking that they have sensible inputs and correct constructor arguments.

In order to check the `build-info` contents, follow these steps:

```bash
$ git checkout <build-info-generation-commit>
$ cd <contract package>
$ rm -rf artifacts # clean prior builds
$ yarn hardhat compile
$ diff artifacts/build-info/<actual-build-info>.json tasks/<task-id>/build-info/<expected-build-info>.json
```

The final `diff` command will produce no output if the build information files match.

## Running Tasks

### Prerequisites

Networks are defined in the repo. Secrets and the signer come from environment variables:

| Variable                       | Used for                                                                                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRPC_API_KEY` (or `DRPC_KEY`) | RPC endpoint for every network: `https://lb.drpc.live/<drpc name>/<key>`. Without a key, dRPC's free endpoint `https://<drpc name>.drpc.org`, which does not cover every chain (Sepolia is paid-only) |
| `RPC_URL_<NETWORK>`            | Overrides the endpoint for one network, e.g. `RPC_URL_BASE=http://127.0.0.1:8545`                                                                                                                     |
| `ETHERSCAN_API_KEY`            | Explorer verification. Etherscan's v2 API takes one key for every chain. `--key` overrides it                                                                                                         |
| `LEDGER_ACCOUNT`               | Ledger address that signs. Defaults to the deployer, `0xe7691e2764b4f4cB77Bc8380E16b66e4cDFbFf8b`                                                                                                     |
| `DEPLOYER_PRIVATE_KEY`         | Signs with this key instead of a Ledger                                                                                                                                                               |

The Ledger is only opened to sign. Unlock it and open the Ethereum app before deploying. Contract deployment prompts for blind signing. `yarn test` does not use these accounts. It forks through the in-process Hardhat network.

`addresses/.supported-networks.json` is the list of networks: chain id, block explorer and dRPC name. `sepolia` is chain id 11155111 and `base` is 8453. To add a chain, add it there and give the per-network constants in `src/constants.ts` (WETH, USDC, constant price feed, sequencer uptime feed) a value for it. Chains the verifier does not already know also need an `etherscan.customChains` entry in `hardhat.config.ts`.

### `deploy`

```bash
$ yarn deploy --id <task-id> --network <network>
```

This broadcasts any contract not already listed in `output/<network>.json`, saves its address there, writes the transaction hash to `deployment-txs/<network>.json`, and submits the source for verification[^1]. It then runs `save-action-ids` and `build-address-lookup` for every network, then `build-lookup`. `save-action-ids` reads `getActionId` from each deployed contract and merges the result into `action-ids/<network>/action-ids.json`. `build-address-lookup` rewrites `addresses/<network>.json` from the task outputs. `build-lookup` writes `addresses/_lookup.json` from those files, as `<network>/<status>/<task>/{<Contract>: <address>}`.

The signer is used only when a contract is missing from `output/<network>.json`. A later run that finds the contract there verifies and regenerates the files above without opening it. Pass `--force` to broadcast again.

A contract created by a factory and not listed in the task output is omitted from `save-action-ids`. Record it with `yarn hardhat save-action-ids --network <network> --id <task-id> --name <Contract> --address <address>`.

This mechanism should work for EVM-equivalent networks, using the same compiled artifact on each one.

### `rehearse`

```bash
$ yarn rehearse <network>
$ yarn rehearse <network> --reference sepolia --skip-simulation
```

Contracts the deployer creates itself get the same address on every network only if each one is created at the same nonce. `rehearse` reads the task order and nonces from the reference network (`sepolia` by default): `deployment-txs/<reference>.json` gives each task's nonces, and any lower nonce with no recorded transaction was spent on a failed one. It prints that plan, with `BURN` for each spent nonce.

Impersonating skips the signer `yarn deploy` uses, so it first checks that `--network <network>` offers the deployer, through `DEPLOYER_PRIVATE_KEY` or the Ledger at `LEDGER_ACCOUNT`. Listing accounts does not open the Ledger.

It then runs every task in LIVE mode on a fork of `<network>`, with the fork's chain id and the reference deployer impersonated. When a task would sign at a nonce to burn, the run stops the way a rejected Ledger prompt does, burns the nonce with a 0-value self-transfer, and runs the task again. Each address is compared with the reference. One the deployer created itself must match. One a factory created may differ, because pool factories mix `block.chainid` into the CREATE2 salt.

Explorer verification is rehearsed with the key and chain config `yarn deploy` would use (`--key` overrides the key). Before the fork run, it calls each Etherscan endpoint verification needs with harmless requests, so a bad key or a chain outside the API plan fails fast. During the run, each contract's request is prepared but not submitted: trimmed sources, the fork's bytecode matched to the build-info, and encoded constructor arguments. Etherscan only accepts a submission once the bytecode is on the live chain, so that last step happens in `yarn deploy`. Pass `--skip-verification` to skip all of this.

Finally it sends every recorded transaction to the live RPC with `eth_simulateV1`, which executes them with the chain's own client and fork rules. Hardhat's EVM can trail a live chain: it does not know Glamsterdam, for example. Each transaction must succeed within the gas limit it was given. The RPC must support `eth_simulateV1`; otherwise pass `--skip-simulation`. Outputs and transaction hashes written for `<network>` are restored afterwards.

To deploy, follow the printed plan with `yarn deploy`. Reject the Ledger prompt that would sign at a nonce marked `BURN`; outputs are saved per contract, so the rerun resumes. Burn the nonce, then run the same task again:

```bash
$ cast send <deployer> --value 0 --nonce <nonce> --ledger --rpc-url <url>
```

`yarn test` forks each network in its own process, because Hardhat fixes the chain id when the provider is created. It skips a task whose dependencies are not yet deployed on that network.

## Checking Deployments

`yarn check` runs `lint`, `check-artifacts`, `check-deployments`, `check-action-ids`, and `check-address-lookup`. `check-deployments` compares each address in `output/<network>.json` to the transaction in `deployment-txs/<network>.json`, using `index.ts`, `input.ts`, and `build-info`. CI runs the same checks. The ones that read the chain need an [RPC endpoint](#prerequisites). CI passes the `DRPC_API_KEY` secret.

## Running Tests

`yarn test` runs every task on a local fork of each configured network, then runs Mocha files under a task's `test/` directory. Transactions stay on the fork. A task with no Mocha file still runs.

```bash
$ yarn test
$ yarn test --id <task-id>
$ yarn test --deployer <address>
```

The task id is the directory name, such as `20261013-authorizer`. `--id` limits both the fork run and the Mocha files to that task. `--deployer` is the public address impersonated as the transaction sender and funded with 100 ETH on the fork. Omit it and the fork uses Hardhat's built-in account. `--network` selects a live network, so `yarn test` exits when it is set.

The RPC url comes from the same [environment variables](#prerequisites). A private key and an Etherscan API key are not used. Addresses are written to `output/test.json`. That file is the result of the local fork. Each run redeploys, skips explorer verification, and does not record transaction hashes.

### Writing Fork Tests

These are fairly involved, as they use a lot of custom utilities related to loading other tasks, impersonating accounts, etc. The suggested way to write them is to copy one for a similar task and then edit as needed.

[^1]: Each contract is submitted to Sourcify, then to Etherscan. Sourcify needs no key; a failure there is a warning only, so Etherscan decides whether verification succeeded. Until Etherscan has indexed the bytecode it answers "Unable to locate ContractCode", and the submission is retried for up to 3 minutes; after that, run `yarn deploy` again. A contract created by a factory can also be reported as "does NOT match the transaction deployment bytecode" until Etherscan has indexed the transaction that created it, and is resubmitted for up to 3 minutes as well. Sourcify cannot verify some contracts compiled with solc 0.8.26 and `viaIR`, such as `BufferRouter`: it narrows `outputSelection` to the target contract, and solc then fails on the circular imports of `IVault`. This works with a free Etherscan key on paid-tier chains such as Base, where the API's `proxy` module is not available. If the contract is already verified, the log is a yellow notice and the command continues.
