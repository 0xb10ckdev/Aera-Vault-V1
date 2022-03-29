import { task, types } from "hardhat/config";
import { getConfig } from "../../scripts/config";

task(
  "deploy:managerWhitelistFactory",
  "Deploys a ManagerWhitelistFactory with the given parameters",
)
  .addOptionalParam(
    "silent",
    "Disable console log on deployment",
    false,
    types.boolean,
  )
  .setAction(async (taskArgs, { ethers, network }) => {
    const { admin } = await ethers.getNamedSigners();
    const config = getConfig(network.config.chainId || 1);

    if (!taskArgs.silent) {
      console.log("Deploying ManagerWhitelistFactory");
    }

    const contractFactory = await ethers.getContractFactory(
      "ManagerWhitelistFactory",
    );

    const bytecode = contractFactory.bytecode.slice(2);
    const callData = `0x0000000000000000000000000000000000000000000000000000000000000000${bytecode}`;

    const computedAddress = await ethers.provider.send("eth_call", [
      {
        from: admin.address,
        to: config.deployerProxy,
        data: callData,
      },
    ]);

    await ethers.provider.send("eth_sendTransaction", [
      {
        from: admin.address,
        to: config.deployerProxy,
        data: callData,
        gas: "0xf4240",
      },
    ]);

    const factory = await ethers.getContractAt(
      "ManagerWhitelistFactory",
      computedAddress,
    );

    if (!taskArgs.silent) {
      console.log("ManagerWhitelistFactory is deployed to:", factory.address);
    }

    return factory;
  });
