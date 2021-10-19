import { getConfig } from "../../scripts/config";
import { task } from "hardhat/config";

task("deploy:vault")
  .addParam("token0", "Token0's address")
  .addParam("token1", "Token1's address")
  .addParam("manager", "Manager's address")
  .addParam("validator", "Validator's address")
  .addParam("noticePeriod", "Notice Period in second")
  .setAction(async (taskArgs, { deployments, ethers }) => {
    const token0 = taskArgs.token0;
    const token1 = taskArgs.token1;
    const manager = taskArgs.manager;
    const validator = taskArgs.validator;
    const noticePeriod = taskArgs.noticePeriod;

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const config = getConfig(chainId);

    const { admin } = await ethers.getNamedSigners();

    console.log("Deploying vault with");
    console.log(`Token0: ${token0}`);
    console.log(`Token1: ${token1}`);
    console.log(`Manager: ${manager}`);
    console.log(`Validator: ${validator}`);
    console.log(`Notice Period: ${noticePeriod}`);

    await deployments.deploy("MammonVaultV0", {
      contract: "MammonVaultV0",
      args: [
        config.bFactory,
        token0,
        token1,
        manager,
        validator,
        noticePeriod,
      ],
      libraries: {
        SmartPoolManager: config.poolManager,
      },
      from: admin.address,
      log: true,
    });

    console.log(
      "Vault is deployed to:",
      (await deployments.get("MammonVaultV0")).address,
    );
  });
