import { BigNumber, Signer } from "ethers";
import { deployments, ethers } from "hardhat";
import {
  DEFAULT_NOTICE_PERIOD,
  getConfig,
  getChainId,
} from "../scripts/config";
import {
  MammonPoolFactoryV1,
  MammonPoolFactoryV1__factory,
  MammonVaultV1Mainnet,
  MammonVaultV1Mainnet__factory,
} from "../typechain";

export const deployVault = async (
  signer: Signer,
  factory: string,
  name: string,
  symbol: string,
  tokens: string[],
  weights: string[],
  swapFeePercentage: string,
  managementSwapFeePercentage: string,
  manager: string,
  validator?: string,
  noticePeriod: number = DEFAULT_NOTICE_PERIOD,
): Promise<MammonVaultV1Mainnet> => {
  const chainId = getChainId(process.env.HARDHAT_FORK);
  const config = getConfig(chainId);

  const vault = await ethers.getContractFactory<MammonVaultV1Mainnet__factory>(
    config.vault,
  );

  if (!validator) {
    validator = (await deployments.get("Validator")).address;
  }
  return await vault
    .connect(signer)
    .deploy(
      factory,
      name,
      symbol,
      tokens,
      weights,
      swapFeePercentage,
      managementSwapFeePercentage,
      manager,
      validator,
      noticePeriod,
    );
};

export const deployFactory = async (
  signer: Signer,
): Promise<MammonPoolFactoryV1> => {
  const chainId = getChainId(process.env.HARDHAT_FORK);
  const config = getConfig(chainId);

  const factory =
    await ethers.getContractFactory<MammonPoolFactoryV1__factory>(
      "MammonPoolFactoryV1",
    );

  return await factory.connect(signer).deploy(config.bVault);
};

export const toWei = (value: number | string): BigNumber => {
  return ethers.utils.parseEther(value.toString());
};

export const valueArray = (
  value: number | string | BigNumber,
  length: number,
): string[] => {
  return Array.from({ length }, _ => value.toString());
};
