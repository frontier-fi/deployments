# Deploying Contracts

The deployments package aims to provide a robust mechanism to run and verify deployments on multiple networks. This document describes the rationale, what guarantees it provides, and how to create and run deployments.

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

The build information should be generated on a clean commit, so that it can be verified by other parties. On the project directory, delete the `artifacts` directory and run `yarn hardhat compile` for a clean compilation. The file will then be located at `artifacts/build-info`, and it'll contain the data for all the contracts in the workspace.

### Generating artifact files with ABI and bytecode

To generate the artifacts from build info files:

- Copy the generated build info `json` from `artifacts/build-info` to `tasks/<task-id>/build-info`.
- From the `deployments` workspace, run `extract-artifacts` task using the task ID as parameter. Optionally, the contract name and the target file can be specified if e.g. the contract name doesn't match the file name, or if the contract is present in more than one file with different compilation settings. For example:

```
yarn extract-artifacts --id 20221021-managed-pool --name ManagedPool --file ManagedPoolFactory
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

Tasks require an RPC endpoint to broadcast transactions and an Etherscan API key to submit source code for verification. The transaction sender is the first account Hardhat exposes for that network. Configure either a private key or a Ledger address in `~/.hardhat/networks.json`.

This data is accessed via the [`local-networks-config`](https://www.npmjs.com/package/hardhat-local-networks-config-plugin) Hardhat plugin, which expects a JSON file at `~/.hardhat/networks.json` with the following contents (replace accordingly):

```json
{
  "networks": {
    "sepolia": {
      "url": "https://sepolia.rpc.endpoint/myAPIKey",
      "verificationAPIKey": "sepolia-etherscan-API-key",
      "ledgerAccounts": ["0xLedgerAddress"]
    }
  },
  "defaultConfig": {
    "gasPrice": "auto",
    "gasMultiplier": 1,
    "accounts": ["0x-eoa-private-key"]
  }
}
```

Use either `accounts` or `ledgerAccounts`. A private key in `accounts` is the first signer, ahead of a Ledger address. With no private key, the first Ledger address is the signer. Omit the field you are not using.

Unlock the Ledger and open the Ethereum app before deploying. Contract deployment prompts for blind signing. `yarn test` does not use these accounts. It forks through the in-process Hardhat network.

`sepolia` is chain id 11155111. Add another chain in `src/types.ts` (`NETWORKS`), `addresses/.supported-networks.json`, and this file. Chains the verifier does not already know also need an `etherscan.customChains` entry in `hardhat.config.ts`.

### `deploy`

```bash
$ yarn deploy --id <task-id> --network <network>
```

This broadcasts any contract not already listed in `output/<network>.json`, saves its address there, writes the transaction hash to `deployment-txs/<network>.json`, and submits the source for verification[^1]. It then runs `save-action-ids` and `build-address-lookup` for every network. `save-action-ids` reads `getActionId` from each deployed contract and merges the result into `action-ids/<network>/action-ids.json`. `build-address-lookup` rewrites `addresses/<network>.json` from the task outputs.

The signer is used only when a contract is missing from `output/<network>.json`. A later run that finds the contract there verifies and regenerates the files above without opening it. Pass `--force` to broadcast again.

A contract created by a factory and not listed in the task output is omitted from `save-action-ids`. Record it with `yarn hardhat save-action-ids --network <network> --id <task-id> --name <Contract> --address <address>`.

This mechanism should work for EVM-equivalent networks, using the same compiled artifact on each one.

## Checking Deployments

`yarn check` runs `lint`, `check-artifacts`, `check-deployments`, `check-action-ids`, and `check-address-lookup`. `check-deployments` compares each address in `output/<network>.json` to the transaction in `deployment-txs/<network>.json`, using `index.ts`, `input.ts`, and `build-info`. CI runs the same checks. The ones that read the chain need an [RPC endpoint](#prerequisites).

## Running Tests

`yarn test` runs every task on a local fork of each configured network, then runs Mocha files under a task's `test/` directory. Transactions stay on the fork. A task with no Mocha file still runs.

```bash
$ yarn test
$ yarn test --id <task-id>
$ yarn test --deployer <address>
```

The task id is the directory name, such as `20261013-authorizer`. `--id` limits both the fork run and the Mocha files to that task. `--deployer` is the public address impersonated as the transaction sender and funded with 100 ETH on the fork. Omit it and the fork uses Hardhat's built-in account. `--network` selects a live network, so `yarn test` exits when it is set.

The RPC url comes from `~/.hardhat/networks.json`. A private key and an Etherscan API key are not used. Addresses are written to `output/test.json`. That file is the result of the local fork. Each run redeploys, skips explorer verification, and does not record transaction hashes.

### Writing Fork Tests

These are fairly involved, as they use a lot of custom utilities related to loading other tasks, impersonating accounts, etc. The suggested way to write them is to copy one for a similar task and then edit as needed.

[^1]: If Etherscan has not indexed the bytecode yet, verification fails. Run `yarn deploy` again once it has. If the contract is already verified, the log is a yellow notice and the command continues.
