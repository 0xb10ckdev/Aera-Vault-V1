import { task } from "hardhat/config";

task("deploy:mangos", "Deploys the MANGO Token").setAction(
  async (taskArgs, { deployments, ethers }) => {
    const { admin } = await ethers.getNamedSigners();

    console.log("Deploying MANGO Token");

    await deployments.deploy("Mangos", {
      contract: "MangosKovan",
      from: admin.address,
      log: true,
    });
    console.log(
      "MANGO Token is deployed to:",
      (await deployments.get("Mangos")).address,
    );
  },
);
