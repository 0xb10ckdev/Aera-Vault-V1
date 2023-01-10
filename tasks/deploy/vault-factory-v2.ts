import { task, types } from "hardhat/config";

task("deploy:vaultFactoryV2", "Deploys a Aera vault factory v2")
  .addOptionalParam(
    "silent",
    "Disable console log on deployment",
    false,
    types.boolean,
  )
  .setAction(async (taskArgs, { deployments, ethers }) => {
    const { admin } = await ethers.getNamedSigners();

    if (!taskArgs.silent) {
      console.log("Deploying factory");
    }

    const aeraVaultFactoryV2Contract = "AeraVaultFactoryV2";
    const aeraVaultFactoryV2 = await deployments.deploy(
      aeraVaultFactoryV2Contract,
      {
        contract: aeraVaultFactoryV2Contract,
        from: admin.address,
        log: true,
      },
    );

    if (!taskArgs.silent) {
      console.log("Factory is deployed to:", aeraVaultFactoryV2.address);
    }
  });
