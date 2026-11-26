import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';

import { createMockUpdatableRateProvider, MOCK_INITIAL_VALUE } from '../mock';
import { UpdatableRateProviderBalV3FactoryDeployment } from '../input';
import {
  createdAddress,
  describeForkTest,
  getForkedNetwork,
  getSigner,
  impersonate,
  Task,
  TaskMode,
  ZERO_ADDRESS,
} from '@src';

const FORK_BLOCK = 11963452;

describeForkTest('UpdatableRateProviderBalV3Factory', 'sepolia', FORK_BLOCK, function () {
  let task: Task;
  let factory: Contract;
  let deployment: UpdatableRateProviderBalV3FactoryDeployment;

  before('run task', async () => {
    task = new Task('20261126-updatable-rate-provider', TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });
    factory = await task.deployedInstance('UpdatableRateProviderBalV3Factory');
    deployment = task.input() as UpdatableRateProviderBalV3FactoryDeployment;
  });

  it('sets the configured owner', async () => {
    expect(await factory.owner()).to.equal(deployment.Owner);
  });

  it('checks factory and rate provider versions', async () => {
    const version = JSON.parse(await factory.version());
    expect(version.name).to.equal('UpdatableRateProviderBalV3Factory');
    expect(version.version).to.equal(deployment.RateProviderVersion);
    expect(version.deployment).to.equal('20261126-updatable-rate-provider');
    expect(await factory.getRateProviderVersion()).to.equal(BigInt(deployment.RateProviderVersion));
  });

  it('deploys a rate provider and tracks provenance', async () => {
    const receipt = await createMockUpdatableRateProvider(factory, deployment.Owner);
    const rateProviderAddress = createdAddress(factory, receipt, 'RateProviderCreated', 'rateProvider');
    const rateProvider = await task.instanceAt('UpdatableRateProviderBalV3', rateProviderAddress);

    expect(await factory.isRateProviderFromFactory(rateProviderAddress)).to.equal(true);
    expect(await factory.isRateProviderFromFactory(ZERO_ADDRESS)).to.equal(false);

    expect(await rateProvider.getRate()).to.equal(MOCK_INITIAL_VALUE);
    expect(await rateProvider.feed()).to.equal(ZERO_ADDRESS);
    expect(await rateProvider.invert()).to.equal(false);
    expect(await rateProvider.hasRole(await rateProvider.DEFAULT_ADMIN_ROLE(), deployment.Owner)).to.equal(true);
    expect(await rateProvider.hasRole(await rateProvider.UPDATER_ROLE(), ZERO_ADDRESS)).to.equal(false);
  });

  it('allows only the owner to disable the factory', async () => {
    const stranger = await getSigner(1);
    await expect(factory.connect(stranger).disable())
      .to.be.revertedWithCustomError(factory, 'OwnableUnauthorizedAccount')
      .withArgs(stranger.address);

    const owner = await impersonate(deployment.Owner);
    await expect(factory.connect(owner).disable()).to.emit(factory, 'RateProviderFactoryDisabled');

    await expect(
      factory.create(ZERO_ADDRESS, false, MOCK_INITIAL_VALUE, deployment.Owner, ZERO_ADDRESS)
    ).to.be.revertedWithCustomError(factory, 'RateProviderFactoryIsDisabled');
  });
});
