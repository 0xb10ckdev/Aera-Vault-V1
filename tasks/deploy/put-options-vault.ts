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
  minChunkValue: BigNumberish;
  minOrderActive?: BigNumberish;
  name: string;
  symbol: string;
  opynAddressBook: string;
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
    "Underlying asset of ERC4626 token (for example USDC)",
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
  .addParam(
    "minChunkValue",
    "Minimum total value in vault underlying asset terms (e.g., USDC) that can be used to purchase options",
    null,
    types.string,
  )
  .addParam("name", "ERC4626 token name", null, types.string)
  .addParam("symbol", "ERC4626 token symbol", null, types.string)
  .addParam(
    "opynAddressBook",
    "Opyn V2 Address Book address",
    null,
    types.string,
  )
  .addOptionalParam(
    "minOrderActive",
    "Period of time for a broker to fill buy/sell order. After that period order can be cancelled by anyone.",
    60 * 60 * 24 * 3, // 3 days
    types.int,
  )
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
        minChunkValue,
        minOrderActive,
        name,
        symbol,
        opynAddressBook,
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
        console.log(`Min Chunk Value: ${minChunkValue}`);
        console.log(`Min Order Active: ${minOrderActive}`);
        console.log(`Name: ${name}`);
        console.log(`Symbol: ${symbol}`);
        console.log(`Opyn Address Book: ${opynAddressBook}`);
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
          {
            controller,
            liquidator,
            broker,
            pricer,
            underlyingAsset,
            underlyingOptionsAsset,
            expiryDelta: { min: expiryDeltaMin, max: expiryDeltaMax },
            strikeMultiplier: {
              min: ethers.utils.parseEther(strikeMultiplierMin.toString()),
              max: ethers.utils.parseEther(strikeMultiplierMax.toString()),
            },
            minChunkValue,
            minOrderActive,
            name,
            symbol,
            opynAddressBook,
          },
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
