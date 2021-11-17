import { BigNumber, Signer } from "ethers";
import { deployments, ethers } from "hardhat";
import {
  DEFAULT_NOTICE_PERIOD,
  getConfig,
  getChainId,
} from "../scripts/config";
import {
  MammonVaultV0Mainnet,
  MammonVaultV0Mainnet__factory,
} from "../typechain";
import { ONE_TOKEN } from "./constants";

export const deployVault = async (
  signer: Signer,
  token0: string,
  token1: string,
  manager: string,
  validator?: string,
  noticePeriod: number = DEFAULT_NOTICE_PERIOD,
): Promise<MammonVaultV0Mainnet> => {
  const chainId = getChainId(process.env.HARDHAT_FORK);
  const config = getConfig(chainId);

  const factory =
    await ethers.getContractFactory<MammonVaultV0Mainnet__factory>(
      config.vault,
      {
        libraries: {
          SmartPoolManager: config.poolManager,
        },
      },
    );

  if (!validator) {
    validator = (await deployments.get("Validator")).address;
  }
  return await factory
    .connect(signer)
    .deploy(token0, token1, manager, validator, noticePeriod);
};

export const toWei = (value: number | string): BigNumber => {
  return ethers.utils.parseEther(value.toString());
};

export const ceilDiv = (a: BigNumber, b: BigNumber): BigNumber => {
  return a.div(b).add(a.mod(b).eq(0) ? 0 : 1);
};

export const isOutOfBound = (
  minWeight: BigNumber,
  maxTotalWeight: BigNumber,
  weight0: BigNumber,
  weight1: BigNumber,
): boolean => {
  return (
    weight0.lt(minWeight) ||
    weight1.lt(minWeight) ||
    weight0.add(weight1).gt(maxTotalWeight)
  );
};

export const recalibrateWeights = (
  minTokenWeight: BigNumber,
  maxTotalWeight: BigNumber,
  weight0: BigNumber,
  weight1: BigNumber,
  balance0: BigNumber,
  balance1: BigNumber,
  newWeight0: BigNumber,
  newWeight1: BigNumber,
  newBalance0: BigNumber,
  newBalance1: BigNumber,
): [BigNumber, BigNumber] => {
  if (!isOutOfBound(minTokenWeight, maxTotalWeight, newWeight0, newWeight1)) {
    return [newWeight0, newWeight1];
  }

  const minWeight = newWeight0.gt(newWeight1) ? newWeight1 : newWeight0;
  const recalibrateRatio = ceilDiv(minTokenWeight.mul(ONE_TOKEN), minWeight);
  return [
    weight0
      .mul(newBalance0)
      .mul(recalibrateRatio)
      .div(balance0)
      .div(ONE_TOKEN),
    weight1
      .mul(newBalance1)
      .mul(recalibrateRatio)
      .div(balance1)
      .div(ONE_TOKEN),
  ];
};
