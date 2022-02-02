import { task } from "hardhat/config";

task("deploy:kiwis", "Deploys the MANGO Token").setAction(
  async (taskArgs, { deployments, ethers }) => {
    const { admin } = await ethers.getNamedSigners();

    console.log("Deploying KIWIZ Token");

    await deployments.deploy("Kiwis", {
      contract: "KiwisKovan",
      from: admin.address,
      log: true,
    });
    console.log(
      "KIWIZ Token is deployed to:",
      (await deployments.get("Kiwis")).address,
    );
  },
);
