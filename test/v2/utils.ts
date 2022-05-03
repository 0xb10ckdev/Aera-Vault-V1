import { BigNumber, Signer } from "ethers";
import { deployments, ethers } from "hardhat";
import { DEFAULT_NOTICE_PERIOD } from "../../scripts/config";
import {
  MammonVaultV2Mock,
  MammonVaultV2Mock__factory,
} from "../../typechain";
import { MAX_MANAGEMENT_FEE } from "../v1/constants";

export * from "../v1/utils";

export type VaultParams = {
  signer: Signer;
  factory: string;
  name: string;
  symbol: string;
  assets: {
    tokens: string[];
    weights: string[];
    oracles: string[];
  };
  swapFeePercentage: BigNumber;
  manager: string;
  validator?: string;
  noticePeriod?: number;
  managementFee?: BigNumber;
  description?: string;
};

export const deployVault = async (
  params: VaultParams,
): Promise<MammonVaultV2Mock> => {
  const vault = await ethers.getContractFactory<MammonVaultV2Mock__factory>(
    "MammonVaultV2Mock",
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
      params.assets,
      params.swapFeePercentage,
      params.manager,
      params.validator,
      params.noticePeriod || DEFAULT_NOTICE_PERIOD,
      params.managementFee || MAX_MANAGEMENT_FEE,
      params.description || "",
    );
};

export const toUnit = (
  value: number | string,
  decimals: number,
): BigNumber => {
  return ethers.utils.parseUnits(value.toString(), decimals);
};
