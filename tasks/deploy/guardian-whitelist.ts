import { ethers } from "ethers";
import { task, types } from "hardhat/config";

task(
  "deploy:guardianWhitelist",
  "Deploys a GuardianWhitelist contract with the given parameters",
)
  .addParam("factory", "GuardianWhitelistFactory address")
  .addOptionalParam("guardians", "Guardian addresses", "", types.string)
  .addParam("salt", "Salt for deployment")
  .addOptionalParam(
    "silent",
    "Disable console log on deployment",
    false,
    types.boolean,
  )
  .setAction(async (taskArgs, { ethers }) => {
    const factory = taskArgs.factory;
    const guardians =
      taskArgs.guardians == "" ? [] : taskArgs.guardians.split(",");
    const salt = taskArgs.salt;

    if (!taskArgs.silent) {
      console.log("Deploying GuardianWhitelist with");
      console.log(`GuardianWhitelistFactory: ${factory}`);
      console.log(
        `Initial Guardians: ${
          guardians.length > 0 ? guardians.join("\n") : "no"
        }`,
      );
      console.log(`Salt: ${salt}`);
    }

    const guardianWhitelistFactory = await ethers.getContractAt(
      "GuardianWhitelistFactory",
      factory,
    );

    const trx = await guardianWhitelistFactory.deploy(guardians, salt);
    const receipt = await trx.wait();

    const deployedEvent = receipt.events?.find(
      (e: ethers.Event) => e.event == "Deployed",
    );
    const deployedAddress = deployedEvent?.args?.addr;

    if (!taskArgs.silent) {
      console.log("GuardianWhitelist is deployed to:", deployedAddress);
    }

    const guardianWhitelist = await ethers.getContractAt(
      "GuardianWhitelist",
      deployedAddress,
    );

    return guardianWhitelist;
  });
