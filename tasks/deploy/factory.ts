import { getConfig } from "../../scripts/config";
import { task } from "hardhat/config";

task("deploy:factory", "Deploys a Mammon Pool Factory").setAction(
  async (taskArgs, { deployments, ethers, network }) => {
    const config = getConfig(network.config.chainId || 1);

    const { admin } = await ethers.getNamedSigners();

    console.log("Deploying factory with");
    console.log(`Balancer Vault: ${config.bVault}`);

    await deployments.deploy("MammonPoolFactoryV1", {
      contract: "MammonPoolFactoryV1",
      args: [config.bVault],
      from: admin.address,
      log: true,
    });

    console.log(
      "Factory is deployed to:",
      (await deployments.get("MammonPoolFactoryV1")).address,
    );
  },
);
