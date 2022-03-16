import { ethers } from "ethers";
import { task, types } from "hardhat/config";

task(
  "deploy:managerWhitelist",
  "Deploys a ManagerWhitelist contract with the given parameters",
)
  .addParam("factory", "ManagerWhitelistFactory address")
  .addOptionalParam("managers", "Manager addresses", "", types.string)
  .addParam("salt", "Salt for deployment")
  .addOptionalParam(
    "silent",
    "Disable console log on deployment",
    false,
    types.boolean,
  )
  .setAction(async (taskArgs, { ethers }) => {
    const factory = taskArgs.factory;
    const managers =
      taskArgs.managers == "" ? [] : taskArgs.managers.split(",");
    const salt = taskArgs.salt;

    if (!taskArgs.silent) {
      console.log("Deploying ManagerWhitelist with");
      console.log(`ManagerWhitelistFactory: ${factory}`);
      console.log(
        `Initial Managers: ${
          managers.length > 0 ? managers.join("\n") : "no"
        }`,
      );
      console.log(`Salt: ${salt}`);
    }

    const managerWhitelistFactory = await ethers.getContractAt(
      "ManagerWhitelistFactory",
      factory,
    );

    const trx = await managerWhitelistFactory.deploy(managers, salt);
    const receipt = await trx.wait();

    const deployedEvent = receipt.events?.find(
      (e: ethers.Event) => e.event == "Deployed",
    );
    const deployedAddress = deployedEvent?.args?.addr;

    if (!taskArgs.silent) {
      console.log("ManagerWhitelist is deployed to:", deployedAddress);
    }

    const managerWhitelist = await ethers.getContractAt(
      "ManagerWhitelist",
      deployedAddress,
    );

    return managerWhitelist;
  });
