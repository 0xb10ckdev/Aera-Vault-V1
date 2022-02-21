import { BigNumber, Signer } from "ethers";
import { deployments, ethers } from "hardhat";
import {
  DEFAULT_NOTICE_PERIOD,
  getChainId,
  getConfig,
} from "../scripts/config";
import {
  BaseManagedPoolFactory,
  BaseManagedPoolFactory__factory,
  MammonVaultV1Mock,
  MammonVaultV1Mock__factory,
} from "../typechain";

export const deployVault = async (
  signer: Signer,
  factory: string,
  name: string,
  symbol: string,
  tokens: string[],
  weights: string[],
  swapFeePercentage: string,
  manager: string,
  validator?: string,
  noticePeriod: number = DEFAULT_NOTICE_PERIOD,
  description: string = "",
): Promise<MammonVaultV1Mock> => {
  const vault = await ethers.getContractFactory<MammonVaultV1Mock__factory>(
    "MammonVaultV1Mock",
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
      manager,
      validator,
      noticePeriod,
      description,
    );
};

export const deployFactory = async (
  signer: Signer,
): Promise<BaseManagedPoolFactory> => {
  const chainId = getChainId(process.env.HARDHAT_FORK);
  const config = getConfig(chainId);

  const factory =
    await ethers.getContractFactory<BaseManagedPoolFactory__factory>(
      "BaseManagedPoolFactory",
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
  return new Array(length).fill(value.toString());
};

export const getCurrentTime = async (): Promise<number> => {
  const block = await ethers.provider.getBlock("latest");
  return block.timestamp;
};

export const increaseTime = async (timestamp: number): Promise<void> => {
  await ethers.provider.send("evm_increaseTime", [
    Math.floor(timestamp / 1000),
  ]);
  await ethers.provider.send("evm_mine", []);
};
