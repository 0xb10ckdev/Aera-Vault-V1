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
import { MAX_MANAGEMENT_FEE, ZERO_ADDRESS } from "./constants";

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
  merkleOrchard?: string;
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
  return await vault.connect(params.signer).deploy({
    factory: params.factory,
    name: params.name,
    symbol: params.symbol,
    tokens: params.tokens,
    weights: params.weights,
    swapFeePercentage: params.swapFeePercentage,
    manager: params.manager,
    validator: params.validator,
    noticePeriod: params.noticePeriod || DEFAULT_NOTICE_PERIOD,
    managementFee: params.managementFee || MAX_MANAGEMENT_FEE,
    merkleOrchard: params.merkleOrchard || ZERO_ADDRESS,
    description: params.description || "",
  });
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

export const tokenValueArray = (
  tokens: string[],
  value: number | string | BigNumber,
  length: number,
): { token: string; value: string }[] => {
  return Array.from({ length }, (_: any, i: number) => ({
    token: tokens[i] || ZERO_ADDRESS,
    value: value.toString(),
  }));
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
