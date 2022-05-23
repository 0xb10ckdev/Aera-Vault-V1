import { BigNumber, Signer } from "ethers";
import { deployments, ethers } from "hardhat";
import {
  DEFAULT_NOTICE_PERIOD,
  getChainId,
  getConfig,
} from "../../scripts/config";
import {
  BaseManagedPoolFactory__factory,
  ManagedPoolFactory,
  ManagedPoolFactory__factory,
  MammonVaultV1Mock,
  MammonVaultV1Mock__factory,
  ManagerWhitelist,
  ManagerWhitelist__factory,
} from "../../typechain";
import { MAX_MANAGEMENT_FEE } from "./constants";

export type VaultParams = {
  signer: Signer;
  factory: string;
  name: string;
  symbol: string;
  tokens: string[];
  weights: string[];
  swapFeePercentage: BigNumber;
  manager: string;
  validator?: string;
  noticePeriod?: number;
  managementFee?: BigNumber;
  description?: string;
};

export const deployVault = async (
  params: VaultParams,
): Promise<MammonVaultV1Mock> => {
  const vault = await ethers.getContractFactory<MammonVaultV1Mock__factory>(
    "MammonVaultV1Mock",
  );

  if (!params.validator) {
    params.validator = (await deployments.get("Validator")).address;
  }
  return await vault
    .connect(params.signer)
    .deploy(
      params.factory,
      params.name,
      params.symbol,
      params.tokens,
      params.weights,
      params.swapFeePercentage,
      params.manager,
      params.validator,
      params.noticePeriod || DEFAULT_NOTICE_PERIOD,
      params.managementFee || MAX_MANAGEMENT_FEE,
      params.description || "",
    );
};

export const deployFactory = async (
  signer: Signer,
): Promise<ManagedPoolFactory> => {
  const chainId = getChainId(process.env.HARDHAT_FORK);
  const config = getConfig(chainId);

  const baseManagedPoolFactoryContract =
    await ethers.getContractFactory<BaseManagedPoolFactory__factory>(
      "BaseManagedPoolFactory",
    );

  const baseManagedPoolFactory = await baseManagedPoolFactoryContract
    .connect(signer)
    .deploy(config.bVault);

  const managedPoolFactoryContract =
    await ethers.getContractFactory<ManagedPoolFactory__factory>(
      "ManagedPoolFactory",
    );

  return await managedPoolFactoryContract
    .connect(signer)
    .deploy(baseManagedPoolFactory.address);
};

export const deployManagerWhitelist = async (
  signer: Signer,
  managers: string[],
): Promise<ManagerWhitelist> => {
  const managerWhitelist =
    await ethers.getContractFactory<ManagerWhitelist__factory>(
      "ManagerWhitelist",
    );

  return await managerWhitelist.connect(signer).deploy(managers);
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

export const getTimestamp = async (
  blockNumber: number | undefined,
): Promise<number> => {
  const block = await ethers.provider.getBlock(blockNumber || "latest");
  return block.timestamp;
};

export const increaseTime = async (timestamp: number): Promise<void> => {
  await ethers.provider.send("evm_increaseTime", [Math.floor(timestamp)]);
  await ethers.provider.send("evm_mine", []);
};
