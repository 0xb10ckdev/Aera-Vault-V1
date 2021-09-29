import { BigNumber, Signer } from "ethers";
import { ethers, deployments } from "hardhat";
import { DEFAULT_NOTICE_PERIOD, getConfig } from "../scripts/config";
import {
  MammonVaultV0Mainnet,
  MammonVaultV0Mainnet__factory,
} from "../typechain";

export const deployVault = async (
  signer: Signer,
  token0: string,
  token1: string,
  manager: string,
  validator?: string,
  noticePeriod: number = DEFAULT_NOTICE_PERIOD,
): Promise<MammonVaultV0Mainnet> => {
  const chainId = (await ethers.provider.getNetwork()).chainId;
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
