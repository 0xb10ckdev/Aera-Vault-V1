import { ethers } from "ethers";
import { task, types } from "hardhat/config";
import {
  ManagerWhitelist__factory,
  ManagerWhitelistFactory__factory,
} from "../../typechain";

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

    const { admin } = await ethers.getNamedSigners();

    if (!taskArgs.silent) {
      console.log("Deploying ManagerWhitelist with");
      console.log(`ManagerWhitelistFactory: ${factory}`);
      console.log(
        `Managers: ${managers.length > 0 ? managers.join("\n") : "no"}`,
      );
      console.log(`Salt: ${salt}`);
    }

    const managerWhitelistFactory = ManagerWhitelistFactory__factory.connect(
      factory,
      admin,
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

    const managerWhitelist = ManagerWhitelist__factory.connect(
      deployedAddress,
      admin,
    );

    return managerWhitelist;
  });
