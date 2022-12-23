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
    "Deploy Aera Vault V2 Mock contract",
    false,
    types.boolean,
  )
  .addFlag("printTransactionData", "Get transaction data for deployment")
  .setAction(async (taskArgs, { ethers, network }) => {
    const config = getConfig(network.config.chainId || 1);

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    let vaultConfig: any = {};
    try {
      vaultConfig = JSON.parse(await readFile(taskArgs.configPath, "utf8"));
    } catch (e) {
      console.error("Invliad json file is provided for vault configuration");
      return;
    }

    vaultConfig.minSignificantDepositValue =
      vaultConfig.minSignificantDepositValue || MIN_SIGNIFICANT_DEPOSIT_VALUE;
    vaultConfig.maxOracleSpotDivergence =
      vaultConfig.maxOracleSpotDivergence || MAX_ORACLE_SPOT_DIVERGENCE;
    vaultConfig.maxOracleDelay =
      vaultConfig.maxOracleDelay || MAX_ORACLE_DELAY;

    if (!vaultConfig.merkleOrchard) {
      if (!taskArgs.silent) {
        console.warn(
          "Use default Merkle Orchard address since it's not provided",
        );
      }
      vaultConfig.merkleOrchard =
        config.merkleOrchard || ethers.constants.AddressZero;
    }

    // Generate temporary weights for pool creation
    // Token weights will be adjusted at initialization
    const numPoolTokens = vaultConfig.poolTokens.length;
    const avgWeight = toWei(1).div(numPoolTokens);
    const weights = Array.from({ length: numPoolTokens }, _ =>
      avgWeight.toString(),
    );
    // Make the sum of weights be one
    weights[0] = toWei(1)
      .sub(avgWeight.mul(numPoolTokens))
      .add(weights[0])
      .toString();
    vaultConfig.weights = weights;

    const yieldTokens = vaultConfig.yieldTokens.map(
      (yieldToken: { token: string; isWithdrawable: boolean }) =>
        yieldToken.token,
    );
    for (let i = 0; i < yieldTokens.length; i++) {
      const asset = await ethers.getContractAt("ERC4626", yieldTokens[i]);
      const underlyingAsset = await asset.asset();
      vaultConfig.yieldTokens[i].underlyingIndex =
        vaultConfig.poolTokens.findIndex(
          (poolToken: string) => poolToken == underlyingAsset,
        );
    }

    if (numPoolTokens < 2) {
      console.error("Number of tokens should be at least two");
      return;
    }

    if (numPoolTokens != vaultConfig.oracles.length) {
      console.error("Number of tokens and oracles should be same");
      return;
    }

    const [sortedTokens] = assetHelpers.sortTokens(vaultConfig.poolTokens);
    for (let i = 0; i < numPoolTokens; i++) {
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
      console.log("YieldTokens:\n", yieldTokens.join("\n"));
      console.log("Numeraire Asset Index:\n", vaultConfig.numeraireAssetIndex);
      console.log(`Swap Fee: ${vaultConfig.swapFeePercentage}`);
      console.log(`Guardian: ${vaultConfig.guardian}`);
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

    if (taskArgs.printTransactionData) {
      const calldata = vaultFactory.getDeployTransaction(vaultConfig).data;
      console.log("Deployment Transaction Data:", calldata);
      return;
    }

    const vault = await vaultFactory.connect(admin).deploy(vaultConfig);

    if (!taskArgs.silent) {
      console.log("Vault is deployed to:", vault.address);
    }

    return vault;
  });
