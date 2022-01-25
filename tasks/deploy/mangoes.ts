import { task } from "hardhat/config";

task("deploy:mangoes", "Deploys the MANGO Token").setAction(
  async (taskArgs, { deployments, ethers }) => {
    const { admin } = await ethers.getNamedSigners();

    console.log("Deploying MANGO Token");

    await deployments.deploy("Mangoes", {
      contract: "MangoesKovan",
      from: admin.address,
      log: true,
    });
    console.log(
      "MANGO Token is deployed to:",
      (await deployments.get("Mangoes")).address,
    );
  },
);
