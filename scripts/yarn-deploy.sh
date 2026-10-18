#!/bin/sh
set -e

hardhat deploy "$@"
yarn save-action-ids
yarn build-address-lookup
