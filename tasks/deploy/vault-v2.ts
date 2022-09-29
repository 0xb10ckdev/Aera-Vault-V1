import { AssetHelpers } from "@balancer-labs/balancer-js";
import { task, types } from "hardhat/config";
import { readFile } from "fs/promises";
import { getConfig } from "../../scripts/config";
import { toWei } from "../../test/v1/constants";
import {
  MAX_ORACLE_DELAY,
  MAX_ORACLE_SPOT_DIVERGENCE,
  MIN_SIGNIFICANT_DEPOSIT_VALUE,
} from "../../test/v2/constants";

// https://github.com/balancer-labs/balancer-v2-monorepo/blob/master/pkg/balancer-js/test/tokens.test.ts
const wethAddress = "0x000000000000000000000000000000000000000F";
const assetHelpers = new AssetHelpers(wethAddress);

task("deploy:vaultV2", "Deploys an Aera vault v2 with the given parameters")
  .addParam("configPath", "Path of configuration for vault parameters")
  .addOptionalParam(
    "silent",
    "Disable console log on deployment",
    false,
    types.boolean,
  )
  .addOptionalParam(
    "test",
    "Deploy Aera Vault V1 Mock contract",
    false,
    types.boolean,
  )
  .setAction(async (taskArgs, { ethers, network }) => {
    const config = getConfig(network.config.chainId || 1);

    const vaultConfig = JSON.parse(
      await readFile(taskArgs.configPath, "utf8"),
    );

    vaultConfig.minSignificantDepositValue =
      vaultConfig.minSignificantDepositValue || MIN_SIGNIFICANT_DEPOSIT_VALUE;
    vaultConfig.maxOracleSpotDivergence =
      vaultConfig.maxOracleSpotDivergence || MAX_ORACLE_SPOT_DIVERGENCE;
    vaultConfig.maxOracleDelay =
      vaultConfig.maxOracleDelay || MAX_ORACLE_DELAY;
    vaultConfig.merkleOrchard =
      config.merkleOrchard || ethers.constants.AddressZero;

    const avgWeight = toWei(1).div(vaultConfig.poolTokens.length);
    const weights = Array.from({ length: vaultConfig.poolTokens.length }, _ =>
      avgWeight.toString(),
    );
    weights[0] = toWei(1)
      .sub(avgWeight.mul(vaultConfig.poolTokens.length))
      .add(weights[0])
      .toString();
    vaultConfig.weights = weights;

    if (vaultConfig.poolTokens.length < 2) {
      console.error("Number of tokens should be at least two");
      return;
    }

    if (vaultConfig.poolTokens.length != vaultConfig.oracles.length) {
      console.error("Number of tokens and oracles should be same");
      return;
    }

    const [sortedTokens] = assetHelpers.sortTokens(vaultConfig.poolTokens);
    for (let i = 0; i < vaultConfig.poolTokens.length; i++) {
      if (vaultConfig.poolTokens[i] !== sortedTokens[i]) {
        console.error("Tokens should be sorted by address in ascending order");
        return;
      }
    }

    const { admin } = await ethers.getNamedSigners();

    if (!taskArgs.silent) {
      console.log("Deploying vault with");
      console.log(`Factory: ${vaultConfig.factory}`);
      console.log(`Name: ${vaultConfig.name}`);
      console.log(`Symbol: ${vaultConfig.symbol}`);
      console.log("Tokens:\n", vaultConfig.poolTokens.join("\n"));
      console.log("Weights:\n", vaultConfig.weights.join("\n"));
      console.log("Oracles:\n", vaultConfig.oracles.join("\n"));
      console.log(
        "YieldBearingAssets:\n",
        vaultConfig.yieldBearingAssets
          .map(
            (yieldBearingAssets: { asset: string; underyingIndex: number }) =>
              yieldBearingAssets.asset,
          )
          .join("\n"),
      );
      console.log("Numeraire Asset Index:\n", vaultConfig.numeraireAssetIndex);
      console.log(`Swap Fee: ${vaultConfig.swapFeePercentage}`);
      console.log(`Manager: ${vaultConfig.manager}`);
      console.log(`Validator: ${vaultConfig.validator}`);
      console.log(
        `Minimum Reliable Vault Value: ${vaultConfig.minReliableVaultValue}`,
      );
      console.log(
        `Minimum Significant Deposit Value: ${vaultConfig.minSignificantDepositValue}`,
      );
      console.log(
        `Maximum Oracle Spot Divergence: ${vaultConfig.maxOracleSpotDivergence}`,
      );
      console.log(`Maximum Oracle Delay: ${vaultConfig.maxOracleDelay}`);
      console.log(`Minimum Fee Duration: ${vaultConfig.minFeeDuration}`);
      console.log(`Management Fee: ${vaultConfig.managementFee}`);
      console.log(`Merkle Orchard: ${vaultConfig.merkleOrchard}`);
      console.log(`Description: ${vaultConfig.description}`);
    }

    const contract = taskArgs.test ? "AeraVaultV2Mock" : "AeraVaultV2";

    const vaultFactory = await ethers.getContractFactory(contract);

    const vault = await vaultFactory.connect(admin).deploy(vaultConfig);

    if (!taskArgs.silent) {
      console.log("Vault is deployed to:", vault.address);
    }

    return vault;
  });
