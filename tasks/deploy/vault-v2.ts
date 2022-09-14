import { AssetHelpers } from "@balancer-labs/balancer-js";
import { task, types } from "hardhat/config";
import { getConfig } from "../../scripts/config";
import {
  MAX_ORACLE_DELAY,
  MAX_ORACLE_SPOT_DIVERGENCE,
  MIN_SIGNIFICANT_DEPOSIT_VALUE,
} from "../../test/v2/constants";

// https://github.com/balancer-labs/balancer-v2-monorepo/blob/master/pkg/balancer-js/test/tokens.test.ts
const wethAddress = "0x000000000000000000000000000000000000000F";
const assetHelpers = new AssetHelpers(wethAddress);

task("deploy:vaultV2", "Deploys an Aera vault v2 with the given parameters")
  .addParam("factory", "Balancer Managed Pool Factory address")
  .addParam("name", "Pool Token's name")
  .addParam("symbol", "Pool Token's symbol")
  .addParam("tokens", "Tokens' addresses")
  .addParam("weights", "Tokens' weights")
  .addParam("oracles", "Oracles for token prices vs base token")
  .addParam("numeraireAssetIndex", "Index of base token for oracles")
  .addParam("swapFee", "Swap Fee Percentage")
  .addParam("manager", "Manager's address")
  .addParam("validator", "Validator's address")
  .addParam(
    "minReliableVaultValue",
    "Minimum reliable vault TVL in base token",
  )
  .addParam(
    "minFeeDuration",
    "Minimum period to charge guaranteed management fee (in seconds)",
  )
  .addParam(
    "managementFee",
    "Management fee earned proportion per second(1e9 is maximum)",
  )
  .addParam(
    "description",
    "Vault text description. Keep it short and simple, please.",
  )
  .addOptionalParam(
    "minSignificantDepositValue",
    "Minimum significant deposit value in base token terms",
  )
  .addOptionalParam(
    "maxOracleSpotDivergence",
    "Maximum oracle spot price divergence",
  )
  .addOptionalParam("maxOracleDelay", "Maximum update delay of oracles")
  .addOptionalParam(
    "silent",
    "Disable console log on deployment",
    false,
    types.boolean,
  )
  .addOptionalParam(
    "test",
    "Deploy Aera Vault V2 Mock contract",
    false,
    types.boolean,
  )
  .addFlag("printTransactionData", "Get transaction data for deployment")
  .setAction(async (taskArgs, { ethers, network }) => {
    const config = getConfig(network.config.chainId || 1);

    const factory = taskArgs.factory;
    const name = taskArgs.name;
    const symbol = taskArgs.symbol;
    const tokens = taskArgs.tokens.split(",");
    const weights = taskArgs.weights.split(",");
    const oracles = taskArgs.oracles.split(",");
    const numeraireAssetIndex = taskArgs.numeraireAssetIndex;
    const swapFeePercentage = taskArgs.swapFee;
    const manager = taskArgs.manager;
    const validator = taskArgs.validator;
    const minReliableVaultValue = taskArgs.minReliableVaultValue;
    const minSignificantDepositValue =
      taskArgs.minSignificantDepositValue || MIN_SIGNIFICANT_DEPOSIT_VALUE;
    const maxOracleSpotDivergence =
      taskArgs.maxOracleSpotDivergence || MAX_ORACLE_SPOT_DIVERGENCE;
    const maxOracleDelay = taskArgs.maxOracleDelay || MAX_ORACLE_DELAY;
    const minFeeDuration = taskArgs.minFeeDuration;
    const managementFee = taskArgs.managementFee;
    const description = taskArgs.description;
    const merkleOrchard = config.merkleOrchard || ethers.constants.AddressZero;

    if (tokens.length < 2) {
      console.error("Number of tokens should be at least two");
      return;
    }

    if (tokens.length != weights.length) {
      console.error("Number of tokens and weights should be same");
      return;
    }

    if (tokens.length != oracles.length) {
      console.error("Number of tokens and oracles should be same");
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
      console.log("Oracles:\n", oracles.join("\n"));
      console.log("Numeraire Asset Index:\n", numeraireAssetIndex);
      console.log(`Swap Fee: ${swapFeePercentage}`);
      console.log(`Manager: ${manager}`);
      console.log(`Validator: ${validator}`);
      console.log(`Minimum Reliable Vault Value: ${minReliableVaultValue}`);
      console.log(
        `Minimum Significant Deposit Value: ${minSignificantDepositValue}`,
      );
      console.log(
        `Maximum Oracle Spot Divergence: ${maxOracleSpotDivergence}`,
      );
      console.log(`Maximum Oracle Delay: ${maxOracleDelay}`);
      console.log(`Minimum Fee Duration: ${minFeeDuration}`);
      console.log(`Management Fee: ${managementFee}`);
      console.log(`Merkle Orchard: ${merkleOrchard}`);
      console.log(`Description: ${description}`);
    }

    const contract = taskArgs.test ? "AeraVaultV2Mock" : "AeraVaultV2";

    const vaultFactory = await ethers.getContractFactory(contract);

    if (taskArgs.printTransactionData) {
      const calldata = vaultFactory.getDeployTransaction([
        factory,
        name,
        symbol,
        tokens,
        weights,
        oracles,
        numeraireAssetIndex,
        swapFeePercentage,
        manager,
        validator,
        minReliableVaultValue,
        minSignificantDepositValue,
        maxOracleSpotDivergence,
        maxOracleDelay,
        minFeeDuration,
        managementFee,
        merkleOrchard,
        description,
      ]).data;
      console.log("Deployment Transaction Data:", calldata);
      return;
    }

    const vault = await vaultFactory.connect(admin).deploy({
      factory,
      name,
      symbol,
      tokens,
      weights,
      oracles,
      numeraireAssetIndex,
      swapFeePercentage,
      manager,
      validator,
      minReliableVaultValue,
      minSignificantDepositValue,
      maxOracleSpotDivergence,
      maxOracleDelay,
      minFeeDuration,
      managementFee,
      merkleOrchard,
      description,
    });

    if (!taskArgs.silent) {
      console.log("Vault is deployed to:", vault.address);
    }

    return vault;
  });
