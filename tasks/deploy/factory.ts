import { task, types } from "hardhat/config";
import { getConfig } from "../../scripts/config";

task("deploy:factory", "Deploys a Mammon Pool Factory")
  .addOptionalParam(
    "silent",
    "Disable console log on deployment",
    false,
    types.boolean,
  )
  .setAction(async (taskArgs, { deployments, ethers, network }) => {
    const config = getConfig(network.config.chainId || 1);

    const { admin } = await ethers.getNamedSigners();

    if (!taskArgs.silent) {
      console.log("Deploying factory with");
      console.log(`Balancer Vault: ${config.bVault}`);
    }

    const baseManagedPoolFactoryContract = "BaseManagedPoolFactory";
    const baseManagedPoolFactory = await deployments.deploy(
      baseManagedPoolFactoryContract,
      {
        contract: baseManagedPoolFactoryContract,
        args: [config.bVault],
        from: admin.address,
        log: true,
      },
    );

    const managedPoolFactoryContract = "ManagedPoolFactory";
    const managedPoolFactory = await deployments.deploy(
      managedPoolFactoryContract,
      {
        contract: managedPoolFactoryContract,
        args: [baseManagedPoolFactory.address],
        from: admin.address,
        log: true,
      },
    );

    if (!taskArgs.silent) {
      console.log("Factory is deployed to:", managedPoolFactory.address);
    }
  });
