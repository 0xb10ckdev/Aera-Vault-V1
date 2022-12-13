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
  AeraVaultV1Mock,
  AeraVaultV1Mock__factory,
} from "../../typechain";
import { MAX_MANAGEMENT_FEE, ZERO_ADDRESS } from "./constants";

export * from "../common/utils";

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
): Promise<AeraVaultV1Mock> => {
  const vault = await ethers.getContractFactory<AeraVaultV1Mock__factory>(
    "AeraVaultV1Mock",
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
