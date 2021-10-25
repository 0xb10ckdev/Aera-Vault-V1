import { task } from "hardhat/config";

task("deploy:oranges", "Deploys the ORNGZ Token").setAction(
  async (taskArgs, { deployments, ethers }) => {
    const { admin } = await ethers.getNamedSigners();

    console.log("Deploying ORNGZ Token");

    await deployments.deploy("Oranges", {
      contract: "OrangesKovan",
      from: admin.address,
      log: true,
    });
    console.log(
      "ORNGZ Token is deployed to:",
      (await deployments.get("Oranges")).address,
    );
  },
);
