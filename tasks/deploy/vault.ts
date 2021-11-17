import { getConfig } from "../../scripts/config";
import { task } from "hardhat/config";

task("deploy:vault", "Deploys a Mammon vault with the given parameters")
  .addParam("token0", "Token0's address")
  .addParam("token1", "Token1's address")
  .addParam("manager", "Manager's address")
  .addParam("validator", "Validator's address")
  .addParam("noticePeriod", "Notice period in seconds")
  .setAction(async (taskArgs, { deployments, ethers, network }) => {
    const token0 = taskArgs.token0;
    const token1 = taskArgs.token1;
    const manager = taskArgs.manager;
    const validator = taskArgs.validator;
    const noticePeriod = taskArgs.noticePeriod;
    
    const config = getConfig(network.config.chainId || 1);

    const { admin } = await ethers.getNamedSigners();

    console.log("Deploying vault with");
    console.log(`Token0: ${token0}`);
    console.log(`Token1: ${token1}`);
    console.log(`Manager: ${manager}`);
    console.log(`Validator: ${validator}`);
    console.log(`Notice Period: ${noticePeriod}`);

    await deployments.deploy(config.vault, {
      contract: config.vault,
      args: [token0, token1, manager, validator, noticePeriod],
      libraries: {
        SmartPoolManager: config.poolManager,
      },
      from: admin.address,
      log: true,
    });

    console.log(
      "Vault is deployed to:",
      (await deployments.get(config.vault)).address,
    );
  });
