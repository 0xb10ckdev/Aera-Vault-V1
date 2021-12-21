import { toWei } from "./utils";
import { ethers } from "hardhat";

export const ONE = toWei("1");
export const MIN_WEIGHT = toWei("0.01");
export const MIN_SWAP_FEE = toWei("0.000001");
export const MAX_SWAP_FEE = toWei("0.1");
export const ZERO_ADDRESS = ethers.constants.AddressZero;
export const MAX_NOTICE_PERIOD = 5184000; // 60 days in seconds
