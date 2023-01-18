import { task, types } from "hardhat/config";

export type DeployPremiaOptionsPricer = {
  volatilitySurfaceOracle: string;
  chainlinkOracle: string;
  baseToken: string;
  underlyingToken: string;
  silent: boolean;
};

task(
  "deploy:premia-options-pricer",
  "Deploys a PremiaOptionsPricer contract with the given parameters",
)
  .addParam(
    "volatilitySurfaceOracle",
    "Premia VolatilitySurfaceOracle address",
    null,
    types.string,
  )
  .addParam(
    "chainlinkOracle",
    "Chainlink oracle for base/underlying token pair",
    null,
    types.string,
  )
  .addParam("baseToken", "Base asset address", null, types.string)
  .addParam("underlyingToken", "Underlying asset address", null, types.string)
  .addOptionalParam(
    "silent",
    "Disable console log on deployment",
    false,
    types.boolean,
  )
  .setAction(
    async (
      {
        volatilitySurfaceOracle,
        chainlinkOracle,
        baseToken,
        underlyingToken,
        silent,
      }: DeployPremiaOptionsPricer,
      { deployments, ethers },
    ) => {
      if (!silent) {
        console.log("Deploying PremiaOptionsPricer with:");
        console.log(
          `\tPremia VolatilitySurfaceOracle: ${volatilitySurfaceOracle}`,
        );
        console.log(`\tChainlink oracle: ${chainlinkOracle}`);
        console.log(`\tBase Token: ${baseToken}`);
        console.log(`\tUnderlying Token: ${underlyingToken}`);
      }
      const { admin } = await ethers.getNamedSigners();

      const pricer = await deployments.deploy("PremiaOptionsPricer", {
        contract: "PremiaOptionsPricer",
        args: [
          volatilitySurfaceOracle,
          chainlinkOracle,
          baseToken,
          underlyingToken,
        ],
        from: admin.address,
        log: true,
      });

      if (!silent) {
        console.log(
          "PremiaOptionsPricer is deployed to:",
          (await deployments.get("PremiaOptionsPricer")).address,
        );
      }

      return pricer.address;
    },
  );
