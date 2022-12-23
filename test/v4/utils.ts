import { Signer } from "ethers";
import { ethers } from "hardhat";
import {
  GuardianWhitelist,
  GuardianWhitelist__factory,
} from "../../typechain";

export * from "../common/utils";

export const deployGuardianWhitelist = async (
  signer: Signer,
  guardians: string[],
): Promise<GuardianWhitelist> => {
  const guardianWhitelist =
    await ethers.getContractFactory<GuardianWhitelist__factory>(
      "GuardianWhitelist",
    );

  return await guardianWhitelist.connect(signer).deploy(guardians);
};
