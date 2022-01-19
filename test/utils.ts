import { BigNumber, Signer } from "ethers";
import { deployments, ethers } from "hardhat";
import {
  DEFAULT_NOTICE_PERIOD,
  getConfig,
  getChainId,
} from "../scripts/config";
import {
  MammonVaultV1Mainnet,
  MammonVaultV1Mainnet__factory,
} from "../typechain";

export const deployVault = async (
  signer: Signer,
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

  const factory =
    await ethers.getContractFactory<MammonVaultV1Mainnet__factory>(
      config.vault,
    );

  if (!validator) {
    validator = (await deployments.get("Validator")).address;
  }
  return await factory
    .connect(signer)
    .deploy(
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

export const toWei = (value: number | string): BigNumber => {
  return ethers.utils.parseEther(value.toString());
};
