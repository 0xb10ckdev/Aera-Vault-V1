import { task, types } from "hardhat/config";
import { getConfig } from "../../scripts/config";
import { GuardianWhitelistFactoryDeployment } from "../guardian-whitelist-factory-address";

task(
  "deploy:guardianWhitelistFactory",
  "Deploys a GuardianWhitelistFactory with the given parameters",
)
  .addOptionalParam(
    "silent",
    "Disable console log on deployment",
    false,
    types.boolean,
  )
  .setAction(async (taskArgs, { ethers, run, network }) => {
    const config = getConfig(network.config.chainId || 1);

    const { admin } = await ethers.getNamedSigners();

    const deployment = (await run("get:guardianWhitelistFactory", {
      owner: admin.address,
    })) as GuardianWhitelistFactoryDeployment;

    if (!taskArgs.silent) {
      console.log(
        `Deploying GuardianWhitelistFactory\n\tSender: ${deployment.sender}\n\tContract address: ${deployment.contractAddr}`,
      );
    }

    // We need to fund the calculated sender first
    const funding = await admin.sendTransaction({
      to: deployment.sender,
      value: ethers.BigNumber.from(config.gasLimit).mul(
        config.gasPrice,
      ),
    });
    await funding.wait();

    const tx = await ethers.provider.sendTransaction(deployment.rawTx);
    await tx.wait();

    const factory = await ethers.getContractAt(
      "GuardianWhitelistFactory",
      deployment.contractAddr,
    );

    if (!taskArgs.silent) {
      console.log("GuardianWhitelistFactory is deployed to:", factory.address);
    }

    return factory;
  });
