import { AssetHelpers } from "@balancer-labs/balancer-js";
import { task, types } from "hardhat/config";

// https://github.com/balancer-labs/balancer-v2-monorepo/blob/master/pkg/balancer-js/test/tokens.test.ts
const wethAddress = "0x000000000000000000000000000000000000000F";
const assetHelpers = new AssetHelpers(wethAddress);

task("deploy:vault", "Deploys a Mammon vault with the given parameters")
  .addParam("factory", "Balancer Managed Pool Factory address")
  .addParam("name", "Pool Token's name")
  .addParam("symbol", "Pool Token's symbol")
  .addParam("tokens", "Tokens' addresses")
  .addParam("weights", "Tokens' weights")
  .addParam("swapFee", "Swap Fee Percentage")
  .addParam("manager", "Manager's address")
  .addParam("validator", "Validator's address")
  .addParam("noticePeriod", "Notice period in seconds")
  .addParam(
    "managementFee",
    "Management fee earned proportion per second(1e9 is maximum)",
  )
  .addParam(
    "description",
    "Vault text description. Keep it short and simple, please.",
  )
  .addOptionalParam(
    "silent",
    "Disable console log on deployment",
    false,
    types.boolean,
  )
  .addOptionalParam(
    "test",
    "Deploy Mammon Vault V1 Mock contract",
    false,
    types.boolean,
  )
  .setAction(async (taskArgs, { ethers }) => {
    const factory = taskArgs.factory;
    const name = taskArgs.name;
    const symbol = taskArgs.symbol;
    const tokens = taskArgs.tokens.split(",");
    const weights = taskArgs.weights.split(",");
    const swapFee = taskArgs.swapFee;
    const manager = taskArgs.manager;
    const validator = taskArgs.validator;
    const noticePeriod = taskArgs.noticePeriod;
    const managementFee = taskArgs.managementFee;
    const description = taskArgs.description;

    if (tokens.length < 2) {
      console.error("Number of Tokens should be at least two");
      return;
    }

    const [sortedTokens] = assetHelpers.sortTokens(tokens);
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] !== sortedTokens[i]) {
        console.error("Tokens should be sorted by address in ascending order");
        return;
      }
    }

    const { admin } = await ethers.getNamedSigners();

    if (!taskArgs.silent) {
      console.log("Deploying vault with");
      console.log(`Factory: ${factory}`);
      console.log(`Name: ${name}`);
      console.log(`Symbol: ${symbol}`);
      console.log("Tokens:\n", tokens.join("\n"));
      console.log("Weights:\n", weights.join("\n"));
      console.log(`Swap Fee: ${swapFee}`);
      console.log(`Manager: ${manager}`);
      console.log(`Validator: ${validator}`);
      console.log(`Notice Period: ${noticePeriod}`);
      console.log(`Management Fee: ${managementFee}`);
      console.log(`Description: ${description}`);
    }

    const contract = taskArgs.test ? "MammonVaultV1Mock" : "MammonVaultV1";

    const vaultFactory = await ethers.getContractFactory(contract);

    const vault = await vaultFactory
      .connect(admin)
      .deploy(
        factory,
        name,
        symbol,
        tokens,
        weights,
        swapFee,
        manager,
        validator,
        noticePeriod,
        managementFee,
        description,
      );

    if (!taskArgs.silent) {
      console.log("Vault is deployed to:", vault.address);
    }

    return vault;
  });
