import { Task, TaskMode } from '@src';

export type VaultFactoryDeployment = {
  Authorizer: string;
  pauseWindowDuration: number;
  bufferPeriodDuration: number;
  minTradeAmount: number;
  minWrapAmount: number;
  vaultCreationCode: string;
  vaultExtensionCreationCode: string;
  vaultAdminCreationCode: string;
  salt: string;
  targetVaultAddress: string;
  deployer: string;
  InitialGlobalProtocolSwapFee: bigint;
  InitialGlobalProtocolYieldFee: bigint;
};

const MONTH = 30 * 24 * 60 * 60;

const Authorizer = new Task('20261013-authorizer', TaskMode.READ_ONLY);
const Vault = new Task('20261016-vault', TaskMode.READ_ONLY);

const vaultArtifact = Vault.artifact('Vault');
const vaultCreationCode = vaultArtifact.bytecode;

const vaultExtensionArtifact = Vault.artifact('VaultExtension');
const vaultExtensionCreationCode = vaultExtensionArtifact.bytecode;

const vaultAdminArtifact = Vault.artifact('VaultAdmin');
const vaultAdminCreationCode = vaultAdminArtifact.bytecode;

const salt = '0xffffffffffffffffffffffffffffffffffffffff1dbdf29c5c6afc0310605d78';
const targetVaultAddress = '0xFF945dBDA729db3EC82AfA32C96852D89Be101FF';
const deployer = '0xe7691e2764b4f4cB77Bc8380E16b66e4cDFbFf8b';

const initialGlobalProtocolSwapFee = 0n;
const initialGlobalProtocolYieldFee = 0n;

export default {
  Authorizer,
  pauseWindowDuration: 4 * MONTH * 12,
  bufferPeriodDuration: 6 * MONTH,
  minTradeAmount: 1e6,
  minWrapAmount: 1e4,
  vaultCreationCode,
  vaultExtensionCreationCode,
  vaultAdminCreationCode,
  salt,
  targetVaultAddress,
  deployer,
  InitialGlobalProtocolSwapFee: initialGlobalProtocolSwapFee,
  InitialGlobalProtocolYieldFee: initialGlobalProtocolYieldFee,
};
