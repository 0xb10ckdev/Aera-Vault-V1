import { task, types } from "hardhat/config";
import { getConfig } from "../../scripts/config";

task("deploy:factory", "Deploys a Base Managed Pool Factory")
  .addParam("maxYield", "Maximum yield value of fee provider")
  .addParam("maxAum", "Maximum aum value of fee provider")
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

    const addRemoveTokenLib = await deployments.deploy(
      "ManagedPoolAddRemoveTokenLib",
      {
        from: admin.address,
      },
    );
    const circuitBreakerLib = await deployments.deploy("CircuitBreakerLib", {
      from: admin.address,
    });
    const protocolFeeProvider = await deployments.deploy(
      "ProtocolFeePercentagesProvider",
      {
        args: [taskArgs.maxYield, taskArgs.maxAum],
        from: admin.address,
      },
    );

    const managedPoolFactory = await deployments.deploy("ManagedPoolFactory", {
      contract: "ManagedPoolFactory",
      args: [config.bVault, protocolFeeProvider.address],
      libraries: {
        CircuitBreakerLib: circuitBreakerLib.address,
        ManagedPoolAddRemoveTokenLib: addRemoveTokenLib.address,
      },
      from: admin.address,
      log: true,
    });

    if (!taskArgs.silent) {
      console.log("Factory is deployed to:", managedPoolFactory.address);
    }
  });
