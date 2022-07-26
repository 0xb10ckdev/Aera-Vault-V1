import { BigNumber } from "ethers";
import { deployments, ethers } from "hardhat";
import { DEFAULT_NOTICE_PERIOD } from "../../scripts/config";
import { AeraVaultV2Mock, AeraVaultV2Mock__factory } from "../../typechain";
import { MAX_MANAGEMENT_FEE, ZERO_ADDRESS } from "../v1/constants";
import { VaultParams } from "../v1/utils";

export * from "../v1/utils";

export const deployVault = async (
  params: VaultParams,
  oracles: string[],
  numeraireAssetIndex: number,
): Promise<AeraVaultV2Mock> => {
  const vault = await ethers.getContractFactory<AeraVaultV2Mock__factory>(
    "AeraVaultV2Mock",
  );

  if (!params.validator) {
    params.validator = (await deployments.get("Validator")).address;
  }
  return await vault.connect(params.signer).deploy(
    {
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
    },
    oracles,
    numeraireAssetIndex,
  );
};

export const toUnit = (
  value: number | string,
  decimals: number,
): BigNumber => {
  return ethers.utils.parseUnits(value.toString(), decimals);
};
