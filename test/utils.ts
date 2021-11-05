import { BigNumber } from "ethers";
import { ethers } from "hardhat";

export const toWei = (value: number | string): BigNumber => {
  return ethers.utils.parseEther(value.toString());
};
