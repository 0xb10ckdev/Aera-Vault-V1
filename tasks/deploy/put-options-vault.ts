import { BigNumberish } from "ethers";
import { task, types } from "hardhat/config";

export type DeployPutOptionsVault = {
  controller: string;
  liquidator: string;
  broker: string;
  pricer: string;
  underlyingAsset: string;
  underlyingOptionsAsset: string;
  expiryDeltaMin: number;
  expiryDeltaMax: number;
  strikeMultiplierMin: BigNumberish;
  strikeMultiplierMax: BigNumberish;
  name: string;
  symbol: string;
  silent: boolean;
};

task(
  "deploy:put-options-vault",
  "Deploys a PutOptionsVault contract with the given parameters",
)
  .addParam("controller", "Controller role address", null, types.string)
  .addParam("liquidator", "Liquidator role address", null, types.string)
  .addParam("broker", "Broker role address", null, types.string)
  .addParam("pricer", "Pricer address", null, types.string)
  .addParam(
    "underlyingAsset",
    "Underlying asset of ERC4626 token (e.g. USDC)",
    null,
    types.string,
  )
  .addParam(
    "underlyingOptionsAsset",
    "Underlying option asset. NB! this should not be confused with the underlying asset of the ERC4626 vault itself. (e.g. WETH)",
    null,
    types.string,
  )
  .addParam("expiryDeltaMin", "Expiry delta min", null, types.float)
  .addParam("expiryDeltaMax", "Expiry delta max", null, types.float)
  .addParam("strikeMultiplierMin", "Strike multiplier min", null, types.float)
  .addParam("strikeMultiplierMax", "Strike multiplier max", null, types.float)
  .addParam("name", "ERC4626 token name", null, types.string)
  .addParam("symbol", "ERC4626 token symbol", null, types.string)
  .addOptionalParam(
    "silent",
    "Disable console log on deployment",
    false,
    types.boolean,
  )
  .setAction(
    async (
      {
        controller,
        liquidator,
        broker,
        pricer,
        underlyingAsset,
        underlyingOptionsAsset,
        expiryDeltaMin,
        expiryDeltaMax,
        strikeMultiplierMin,
        strikeMultiplierMax,
        name,
        symbol,
        silent,
      }: DeployPutOptionsVault,
      { deployments, ethers },
    ) => {
      if (!silent) {
        console.log("Deploying PutOptionsVault with");
        console.log(`Controller: ${controller}`);
        console.log(`Liquidator: ${liquidator}`);
        console.log(`Broker: ${broker}`);
        console.log(`Pricer: ${pricer}`);
        console.log(`Underlying Asset: ${underlyingAsset}`);
        console.log(`Underlying Options Asset: ${underlyingOptionsAsset}`);
        console.log(`Expiry Delta: (${expiryDeltaMin}, ${expiryDeltaMax})`);
        console.log(
          `Strike Multiplier: (${strikeMultiplierMin}, ${strikeMultiplierMax})`,
        );
        console.log(`Name: ${name}`);
        console.log(`Symbol: ${symbol}`);
      }
      const { admin } = await ethers.getNamedSigners();

      if (
        (await (
          await ethers.getContractAt("IERC20Metadata", underlyingAsset, admin)
        ).symbol()) !== "USDC"
      ) {
        throw new Error("Expected 'underlyingAsset' to be USDC token");
      }
      if (
        (await (
          await ethers.getContractAt(
            "IERC20Metadata",
            underlyingOptionsAsset,
            admin,
          )
        ).symbol()) !== "WETH"
      ) {
        throw new Error("Expected 'underlyingOptionsAsset' to be WETH token");
      }

      const vault = await deployments.deploy("PutOptionsVault", {
        contract: "PutOptionsVault",
        args: [
          controller,
          liquidator,
          broker,
          pricer,
          underlyingAsset,
          underlyingOptionsAsset,
          { min: expiryDeltaMin, max: expiryDeltaMax },
          {
            min: ethers.utils.parseEther(strikeMultiplierMin.toString()),
            max: ethers.utils.parseEther(strikeMultiplierMax.toString()),
          },
          name,
          symbol,
        ],
        from: admin.address,
        log: true,
      });

      if (!silent) {
        console.log(
          "PutOptionsVault is deployed to:",
          (await deployments.get("PutOptionsVault")).address,
        );
      }

      return vault.address;
    },
  );
