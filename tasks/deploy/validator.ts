import { task } from "hardhat/config";

task("deploy:Validator").setAction(
  async (taskArgs, { deployments, ethers }) => {
    const { admin } = await ethers.getNamedSigners();

    await deployments.deploy("Validator", {
      contract: "PermissiveWithdrawalValidator",
      from: admin.address,
      log: true,
    });
    console.log(
      "Validator is deployed to: ",
      (await deployments.get("Validator")).address,
    );
  },
);
