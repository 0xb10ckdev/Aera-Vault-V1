import { Transaction } from "ethereumjs-tx";
import { task, types } from "hardhat/config";
import { getConfig } from "../scripts/config";

// Referred to https://github.com/0xjac/ERC1820/tree/master/js
// `r` and `s` are random numbers.

export type ManagerWhitelistFactoryDeployment = {
  sender: string;
  rawTx: string;
  contractAddr: string;
};

task(
  "get:managerWhitelistFactory",
  "Calculates ManagerWhitelistFactory address",
)
  .addParam("owner", "Initial owner", undefined, types.string)
  .setAction(async ({ owner }: { owner: string }, { ethers, network }) => {
    const config = getConfig(network.config.chainId || 1);

    const contractFactory = await ethers.getContractFactory(
      "ManagerWhitelistFactory",
    );

    const rawTransaction = {
      nonce: 0,
      gasPrice: config.proxyDeployGasPrice,
      value: 0,
      data:
        contractFactory.bytecode +
        ethers.utils
          .solidityPack(["address"], [owner])
          .slice(2)
          .padStart(64, "0"),
      gasLimit: config.proxyDeployGasLimit,
      v: 27,
      r: "0x1889898989898989898989898989898989898989898989898989898989898989",
      s: "0x1889898989898989898989898989898989898989898989898989898989898989",
    };

    const tx = new Transaction(rawTransaction);

    const sender = ethers.utils.getAddress(
      tx.getSenderAddress().toString("hex"),
    );

    return {
      sender,
      rawTx: "0x" + tx.serialize().toString("hex"),
      contractAddr: ethers.utils.getContractAddress({
        from: sender,
        nonce: 0,
      }),
    };
  });
