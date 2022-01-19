import { getConfig } from "../../scripts/config";
<<<<<<< HEAD
import { task, types } from "hardhat/config";

task("deploy:vault", "Deploys a Mammon vault with the given parameters")
  .addParam("factory", "Mammon Pool Factory's address")
=======
import { task } from "hardhat/config";

task("deploy:vault", "Deploys a Mammon vault with the given parameters")
>>>>>>> f91652b (update with init fork test)
  .addParam("name", "Pool Token's name")
  .addParam("symbol", "Pool Token's symbol")
  .addParam("tokens", "Tokens' addresses")
  .addParam("weights", "Tokens' weights")
  .addParam("swapFee", "Swap Fee Percentage")
  .addParam("managementSwapFee", "Management Swap Fee Percentage")
  .addParam("manager", "Manager's address")
  .addParam("validator", "Validator's address")
  .addParam("noticePeriod", "Notice period in seconds")
<<<<<<< HEAD
  .addOptionalParam(
    "silent",
    "Disable console log on deployment",
    false,
    types.boolean,
  )
  .setAction(async (taskArgs, { deployments, ethers, network }) => {
    const factory = taskArgs.factory;
=======
  .setAction(async (taskArgs, { deployments, ethers, network }) => {
>>>>>>> f91652b (update with init fork test)
    const name = taskArgs.name;
    const symbol = taskArgs.symbol;
    const tokens = taskArgs.tokens.split(",");
    const weights = taskArgs.weights.split(",");
    const swapFee = taskArgs.swapFee;
    const managementSwapFee = taskArgs.managementSwapFee;
    const manager = taskArgs.manager;
    const validator = taskArgs.validator;
    const noticePeriod = taskArgs.noticePeriod;

<<<<<<< HEAD
    if (tokens.length < 2) {
      console.error("Number of Tokens should be at least two");
      return;
    }

    for (let i = 0; i < tokens.length - 1; i++) {
      if (tokens[i] < tokens[i + 1]) {
        continue;
      }
      console.error("Tokens should be sorted by address in ascending order");
      return;
    }

=======
>>>>>>> f91652b (update with init fork test)
    const config = getConfig(network.config.chainId || 1);

    const { admin } = await ethers.getNamedSigners();

<<<<<<< HEAD
    if (!taskArgs.silent) {
      console.log("Deploying vault with");
      console.log(`Factory: ${factory}`);
      console.log(`Name: ${name}`);
      console.log(`Symbol: ${symbol}`);
      console.log("Tokens:\n", tokens.join("\n"));
      console.log("Weights:\n", weights.join("\n"));
      console.log(`Swap Fee: ${swapFee}`);
      console.log(`Management Swap Fee: ${managementSwapFee}`);
      console.log(`Manager: ${manager}`);
      console.log(`Validator: ${validator}`);
      console.log(`Notice Period: ${noticePeriod}`);
    }
=======
    console.log("Deploying vault with");
    console.log(`Name: ${name}`);
    console.log(`Symbol: ${symbol}`);
    console.log("Tokens:");
    console.log(tokens.join("\n"));
    console.log("Weights");
    console.log(weights.join("\n"));
    console.log(`Swap Fee: ${swapFee}`);
    console.log(`Management Swap Fee: ${managementSwapFee}`);
    console.log(`Manager: ${manager}`);
    console.log(`Validator: ${validator}`);
    console.log(`Notice Period: ${noticePeriod}`);
>>>>>>> f91652b (update with init fork test)

    await deployments.deploy(config.vault, {
      contract: config.vault,
      args: [
<<<<<<< HEAD
        factory,
=======
>>>>>>> f91652b (update with init fork test)
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

<<<<<<< HEAD
    if (!taskArgs.silent) {
      console.log(
        "Vault is deployed to:",
        (await deployments.get(config.vault)).address,
      );
    }
=======
    console.log(
      "Vault is deployed to:",
      (await deployments.get(config.vault)).address,
    );
>>>>>>> f91652b (update with init fork test)
  });
