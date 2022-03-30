import { task, types } from "hardhat/config";
import { ManagerWhitelistFactoryDeployment } from "../manager-whitelist-factory-address";

task(
  "deploy:managerWhitelistFactory",
  "Deploys a ManagerWhitelistFactory with the given parameters",
)
  .addOptionalParam(
    "silent",
    "Disable console log on deployment",
    false,
    types.boolean,
  )
  .setAction(async (taskArgs, { ethers, run }) => {
    const { admin } = await ethers.getNamedSigners();

    const deployment = (await run("get:managerWhitelistFactory", {
      owner: admin.address,
    })) as ManagerWhitelistFactoryDeployment;

    if (!taskArgs.silent) {
      console.log(
        `Deploying ManagerWhitelistFactory\n\tSender: ${deployment.sender}\n\tContract address: ${deployment.contractAddr}`,
      );
    }

    // We need to fund the calculated sender first
    const funding = await admin.sendTransaction({
      to: deployment.sender,
      value: ethers.utils.parseEther("0.11"),
    });
    await funding.wait();

    const tx = await ethers.provider.sendTransaction(deployment.rawTx);
    await tx.wait();

    const factory = await ethers.getContractAt(
      "ManagerWhitelistFactory",
      deployment.contractAddr,
    );

    if (!taskArgs.silent) {
      console.log("ManagerWhitelistFactory is deployed to:", factory.address);
    }

    return factory;
  });
