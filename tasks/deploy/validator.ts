import { task } from "hardhat/config";

task("deploy:validator", "Deploys the PermissiveWithdrawalValidator contract")
  .addParam("count", "Token Count")
  .setAction(async (taskArgs, { deployments, ethers }) => {
    const count = taskArgs.count;
    const { admin } = await ethers.getNamedSigners();

    console.log("Deploying Validator");

    await deployments.deploy("Validator", {
      contract: "PermissiveWithdrawalValidator",
      args: [count],
      from: admin.address,
      log: true,
    });
    console.log(
      "Validator is deployed to:",
      (await deployments.get("Validator")).address,
    );
  });
