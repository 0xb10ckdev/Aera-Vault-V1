import { Signer } from "ethers";
import { ethers } from "hardhat";
import { ManagerWhitelist, ManagerWhitelist__factory } from "../../typechain";

export * from "../v1/utils";

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
