# 2026-10-16 Vault

Deploys the Vault, VaultAdmin, VaultExtension, and the newer factory. The original factory deployed the ProtocolFeeController itself inside `create`. This one will not: instead, it deploys the newer ProtocolFeeController after the factory, then passes that address in.

Bytecode for the factory and ProtocolFeeController are from the newer [e1ae7f09](https://github.com/balancer/balancer-v3-monorepo/commit/e1ae7f091244ae20e5c1add3e7f89b6d33f48d23). Vault, VaultAdmin, and VaultExtension bytecode is the December 2024 deployment from [25d73b3d](https://github.com/balancer/balancer-v3-monorepo/commit/25d73b3d091f5dde943ad6b7d90db9569222510d).

## Useful files

- [Sepolia addresses](./output/sepolia.json)
- [`VaultFactory` artifact](./artifact/VaultFactory.json)
- [`ProtocolFeeController` artifact](./artifact/ProtocolFeeController.json)
- [`Vault` artifact](./artifact/Vault.json)
- [`VaultAdmin` artifact](./artifact/VaultAdmin.json)
- [`VaultExtension` artifact](./artifact/VaultExtension.json)
