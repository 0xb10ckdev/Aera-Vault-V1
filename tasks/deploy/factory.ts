import { getConfig } from "../../scripts/config";
import { task, types } from "hardhat/config";

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

    await deployments.deploy("MammonPoolFactoryV1", {
      contract: "MammonPoolFactoryV1",
      args: [config.bVault],
      from: admin.address,
      log: true,
    });

    if (!taskArgs.silent) {
      console.log(
        "Factory is deployed to:",
        (await deployments.get("MammonPoolFactoryV1")).address,
      );
    }
  });
