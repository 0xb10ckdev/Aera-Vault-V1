import { BigNumber, BigNumberish } from "ethers";
import { ethers } from "hardhat";

import { ONE, ZERO_ADDRESS } from "./constants";

export const toWei = (value: number | string): BigNumber => {
  return ethers.utils.parseEther(value.toString());
};

export const toUnit = (
  value: number | string,
  decimals: number,
): BigNumber => {
  return ethers.utils.parseUnits(value.toString(), decimals);
};

export const tokenValueArray = (
  tokens: string[],
  value: number | string | BigNumber,
  length: number,
): { token: string; value: string }[] => {
  return Array.from({ length }, (_, i: number) => ({
    token: tokens[i] || ZERO_ADDRESS,
    value: value.toString(),
  }));
};

export const tokenWithValues = (
  tokens: string[],
  values: (string | BigNumber)[],
): { token: string; value: string | BigNumber }[] => {
  return values.map((value: string | BigNumber, i: number) => ({
    token: tokens[i],
    value,
  }));
};

export const valueArray = (
  value: number | string | BigNumber,
  length: number,
): string[] => {
  return new Array(length).fill(value.toString());
};

export const getCurrentTime = async (): Promise<number> => {
  const block = await ethers.provider.getBlock("latest");
  return block.timestamp;
};

export const getTimestamp = async (
  blockNumber: number | undefined,
): Promise<number> => {
  const block = await ethers.provider.getBlock(blockNumber || "latest");
  return block.timestamp;
};

export const increaseTime = async (timestamp: number): Promise<void> => {
  await ethers.provider.send("evm_increaseTime", [Math.floor(timestamp)]);
  await ethers.provider.send("evm_mine", []);
};

export const getWeightSum = (weights: BigNumberish[]): BigNumber => {
  let sum = BigNumber.from(0);
  weights.forEach((weight: BigNumberish) => (sum = sum.add(weight)));

  return sum;
};

export const normalizeWeights = (weights: BigNumberish[]): BigNumber[] => {
  let sum = getWeightSum(weights);
  const adjustedWeights = weights.map(
    (weight: BigNumberish) =>
      (weight = BigNumber.from(weight).mul(ONE).div(sum)),
  );

  sum = getWeightSum(adjustedWeights);
  adjustedWeights[0] = adjustedWeights[0].add(ONE).sub(sum);

  return adjustedWeights;
};
