# 2026-10-20 Gyro E-CLP

Deployment of the `GyroECLPPoolFactory`. Pools from this factory use Gyroscope's E-CLP math, suitable for fungible concentrated liquidity applications.

This version allows pools to be deployed with pool creators, and greatly extends the pause window (75 years).

The Vault address comes from `20261016-vault`.

Bytecode is from [aa9fe538](https://github.com/balancer/balancer-v3-monorepo/commit/aa9fe53856b69ee0be58c273f0b899defb07e89f).

## Useful files

- [`GyroECLPPoolFactory` artifact](./artifact/GyroECLPPoolFactory.json)
- [`GyroECLPPool` artifact](./artifact/GyroECLPPool.json)
