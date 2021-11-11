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

export const recalibrateWeights = (
  MIN_WEIGHT: BigNumber,
  weight0: BigNumber,
  weight1: BigNumber,
): [BigNumber, BigNumber] => {
  const minWeight = weight0.gt(weight1) ? weight1 : weight0;
  const recalibrateRatio = ceilDiv(MIN_WEIGHT.mul(ONE_TOKEN), minWeight);
  const newWeight0 = weight0.mul(recalibrateRatio).div(ONE_TOKEN);
  const newWeight1 = weight1.mul(recalibrateRatio).div(ONE_TOKEN);

  return [newWeight0, newWeight1];
};
