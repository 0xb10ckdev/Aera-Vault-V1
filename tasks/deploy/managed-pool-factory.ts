import { task, types } from "hardhat/config";
import { getConfig } from "../../scripts/config";

task("deploy:managedPoolFactory", "Deploys a Managed Pool Factory")
  .addOptionalParam(
    "silent",
    "Disable console log on deployment",
    false,
    types.boolean,
  )
  .addOptionalParam(
    "gasPrice",
    "Set manual gas price",
    null,
    types.int,
  )
  .setAction(async (taskArgs, { deployments, ethers, network }) => {
    if (taskArgs.gasPrice) {
      console.log(`Using gas price: ${taskArgs.gasPrice}`);
    }
    const config = getConfig(network.config.chainId || 1, {gasPrice: taskArgs.gasPrice});

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
        gasLimit: config.gasLimit,
        gasPrice: config.gasPrice
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
        gasLimit: config.gasLimit,
        gasPrice: config.gasPrice
      },
    );

    if (!taskArgs.silent) {
      console.log("Factory is deployed to:", managedPoolFactory.address);
    }
  });
