import { BigNumber, Signer } from "ethers";
import { deployments, ethers } from "hardhat";
import { DEFAULT_NOTICE_PERIOD } from "../../scripts/config";
import { AeraVaultV2Mock, AeraVaultV2Mock__factory } from "../../typechain";
import { MAX_MANAGEMENT_FEE, ZERO_ADDRESS } from "../v1/constants";

export type VaultParams = {
  signer: Signer;
  factory: string;
  name: string;
  symbol: string;
  tokens: string[];
  weights: string[];
  oracles: string[];
  numeraireAssetIndex: number;
  swapFeePercentage: BigNumber;
  manager: string;
  validator?: string;
  noticePeriod?: number;
  managementFee?: BigNumber;
  merkleOrchard?: string;
  description?: string;
};

export * from "../v1/utils";

export const deployVault = async (
  params: VaultParams,
): Promise<AeraVaultV2Mock> => {
  const vault = await ethers.getContractFactory<AeraVaultV2Mock__factory>(
    "AeraVaultV2Mock",
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
    oracles: params.oracles,
    numeraireAssetIndex: params.numeraireAssetIndex,
    swapFeePercentage: params.swapFeePercentage,
    manager: params.manager,
    validator: params.validator,
    noticePeriod: params.noticePeriod || DEFAULT_NOTICE_PERIOD,
    managementFee: params.managementFee || MAX_MANAGEMENT_FEE,
    merkleOrchard: params.merkleOrchard || ZERO_ADDRESS,
    description: params.description || "",
  });
};

export const toUnit = (
  value: number | string,
  decimals: number,
): BigNumber => {
  return ethers.utils.parseUnits(value.toString(), decimals);
};
