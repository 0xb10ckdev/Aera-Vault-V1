import { task, types } from "hardhat/config";

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
  .setAction(async (taskArgs, { ethers }) => {
    const { admin } = await ethers.getNamedSigners();

    if (!taskArgs.silent) {
      console.log("Deploying ManagerWhitelistFactory");
    }

    const contractFactory = await ethers.getContractFactory(
      "ManagerWhitelistFactory",
    );

    const factory = await contractFactory.connect(admin).deploy();

    if (!taskArgs.silent) {
      console.log("ManagerWhitelistFactory is deployed to:", factory.address);
    }

    return factory;
  });
