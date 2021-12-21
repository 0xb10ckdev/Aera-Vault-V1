import { getConfig } from "../../scripts/config";
import { task } from "hardhat/config";

task("deploy:vault", "Deploys a Mammon vault with the given parameters")
  .addParam("factory", "Mammon Pool Factory's address")
  .addParam("name", "Pool Token's name")
  .addParam("symbol", "Pool Token's symbol")
  .addParam("tokens", "Tokens' addresses")
  .addParam("weights", "Tokens' weights")
  .addParam("swapFee", "Swap Fee Percentage")
  .addParam("managementSwapFee", "Management Swap Fee Percentage")
  .addParam("manager", "Manager's address")
  .addParam("validator", "Validator's address")
  .addParam("noticePeriod", "Notice period in seconds")
  .setAction(async (taskArgs, { deployments, ethers, network }) => {
    const factory = taskArgs.factory;
    const name = taskArgs.name;
    const symbol = taskArgs.symbol;
    const tokens = taskArgs.tokens.split(",");
    const weights = taskArgs.weights.split(",");
    const swapFee = taskArgs.swapFee;
    const managementSwapFee = taskArgs.managementSwapFee;
    const manager = taskArgs.manager;
    const validator = taskArgs.validator;
    const noticePeriod = taskArgs.noticePeriod;

    for (let i = 0; i < tokens.length - 1; i++) {
      if (tokens[i] >= tokens[i + 1]) {
        console.error("Tokens should be sorted by address in ascending order");
        return;
      }
    }

    const config = getConfig(network.config.chainId || 1);

    const { admin } = await ethers.getNamedSigners();

    console.log("Deploying vault with");
    console.log(`Factory: ${factory}`);
    console.log(`Name: ${name}`);
    console.log(`Symbol: ${symbol}`);
    console.log("Tokens:");
    console.log(tokens.join("\n"));
    console.log("Weights:");
    console.log(weights.join("\n"));
    console.log(`Swap Fee: ${swapFee}`);
    console.log(`Management Swap Fee: ${managementSwapFee}`);
    console.log(`Manager: ${manager}`);
    console.log(`Validator: ${validator}`);
    console.log(`Notice Period: ${noticePeriod}`);

    await deployments.deploy(config.vault, {
      contract: config.vault,
      args: [
        factory,
        name,
        symbol,
        tokens,
        weights,
        swapFee,
        managementSwapFee,
        manager,
        validator,
        noticePeriod,
      ],
      from: admin.address,
      log: true,
    });

    console.log(
      "Vault is deployed to:",
      (await deployments.get(config.vault)).address,
    );
  });
