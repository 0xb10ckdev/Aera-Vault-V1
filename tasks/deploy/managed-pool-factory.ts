import { task, types } from "hardhat/config";
import { getConfig } from "../../scripts/config";

task("deploy:managedPoolFactory", "Deploys a Managed Pool Factory")
  .addOptionalParam(
    "silent",
    "Disable console log on deployment",
    false,
    types.boolean,
  )
  .addFlag("gasEstimation", "Get gas cost estimation for deployment")
  .setAction(async (taskArgs, { ethers, network }) => {
    const config = getConfig(network.config.chainId || 1);

    const { admin } = await ethers.getNamedSigners();

    if (!taskArgs.silent) {
      console.log("Deploying factory with");
      console.log(`Balancer Vault: ${config.bVault}`);
    }

    const baseManagedPoolFactoryContract = await ethers.getContractFactory(
      "BaseManagedPoolFactory",
    );
    const managedPoolFactoryContract = await ethers.getContractFactory(
      "ManagedPoolFactory",
    );

    if (taskArgs.gasEstimation) {
      const estimatedGas0 = await ethers.provider.estimateGas({
        data: baseManagedPoolFactoryContract.getDeployTransaction(
          config.bVault,
        ).data,
      });
      const estimatedGas1 = await ethers.provider.estimateGas({
        data: managedPoolFactoryContract.getDeployTransaction(config.bVault)
          .data,
      });

      console.log(
        "Deployment Gas Estimation:",
        estimatedGas0.add(estimatedGas1).toString(),
      );
      return;
    }

    const baseManagedPoolFactory = await baseManagedPoolFactoryContract
      .connect(admin)
      .deploy(config.bVault);

    const managedPoolFactory = await managedPoolFactoryContract
      .connect(admin)
      .deploy(baseManagedPoolFactory.address);

    if (!taskArgs.silent) {
      console.log("Factory is deployed to:", managedPoolFactory.address);
    }
  });
