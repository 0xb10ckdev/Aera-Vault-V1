import { task } from "hardhat/config";

task("deploy:apples", "Deploys the APPLZ Token").setAction(
  async (taskArgs, { deployments, ethers }) => {
    const { admin } = await ethers.getNamedSigners();

    console.log("Deploying APPLZ Token");

    await deployments.deploy("Apples", {
      contract: "ApplesKovan",
      from: admin.address,
      log: true,
    });
    console.log(
      "APPLZ Token is deployed to:",
      (await deployments.get("Apples")).address,
    );
  },
);
