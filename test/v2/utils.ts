import { BigNumber, BigNumberish, Signer } from "ethers";
import { ethers } from "hardhat";
import { getChainId, getConfig } from "../../scripts/config";
import {
  AeraVaultV2Mock,
  AeraVaultV2Mock__factory,
  ManagedPoolFactory,
  ManagedPoolFactory__factory,
} from "../../typechain";
import {
  ONE,
  MAX_MANAGEMENT_FEE,
  MAX_ORACLE_DELAY,
  MAX_ORACLE_SPOT_DIVERGENCE,
  MIN_FEE_DURATION,
  MIN_RELIABLE_VAULT_VALUE,
  MIN_SIGNIFICANT_DEPOSIT_VALUE,
  ZERO_ADDRESS,
} from "./constants";

export * from "../common/utils";

export type VaultParams = {
  signer: Signer;
  factory: string;
  name: string;
  symbol: string;
  poolTokens: string[];
  weights: string[];
  oracles: string[];
  yieldTokens: {
    token: string;
    underlyingIndex: BigNumberish;
    isWithdrawable: boolean;
  }[];
  numeraireAssetIndex: number;
  swapFeePercentage: BigNumberish;
  guardian: string;
  minReliableVaultValue?: BigNumberish;
  minSignificantDepositValue?: BigNumberish;
  maxOracleSpotDivergence?: BigNumberish;
  maxOracleDelay?: BigNumberish;
  minFeeDuration?: BigNumberish;
  managementFee?: BigNumberish;
  merkleOrchard?: string;
  description?: string;
};

export const deployFactory = async (
  signer: Signer,
): Promise<ManagedPoolFactory> => {
  const chainId = getChainId(process.env.HARDHAT_FORK);
  const config = getConfig(chainId);

  const addRemoveTokenLibContract = await ethers.getContractFactory(
    "ManagedPoolAddRemoveTokenLib",
  );
  const circuitBreakerLibContract = await ethers.getContractFactory(
    "CircuitBreakerLib",
  );
  const protocolFeeProviderContract = await ethers.getContractFactory(
    "ProtocolFeePercentagesProvider",
  );

  const addRemoveTokenLib = await addRemoveTokenLibContract
    .connect(signer)
    .deploy();
  const circuitBreakerLib = await circuitBreakerLibContract
    .connect(signer)
    .deploy();
  const protocolFeeProvider = await protocolFeeProviderContract
    .connect(signer)
    .deploy(config.bVault, ONE, ONE);

  const managedPoolFactoryContract =
    await ethers.getContractFactory<ManagedPoolFactory__factory>(
      "ManagedPoolFactory",
      {
        libraries: {
          CircuitBreakerLib: circuitBreakerLib.address,
          ManagedPoolAddRemoveTokenLib: addRemoveTokenLib.address,
        },
      },
    );

  return await managedPoolFactoryContract
    .connect(signer)
    .deploy(config.bVault, protocolFeeProvider.address);
};

export const deployVault = async (
  params: VaultParams,
): Promise<AeraVaultV2Mock> => {
  const vault = await ethers.getContractFactory<AeraVaultV2Mock__factory>(
    "AeraVaultV2Mock",
  );

  return await vault.connect(params.signer).deploy({
    factory: params.factory,
    name: params.name,
    symbol: params.symbol,
    poolTokens: params.poolTokens,
    weights: params.weights,
    oracles: params.oracles,
    yieldTokens: params.yieldTokens,
    numeraireAssetIndex: params.numeraireAssetIndex,
    swapFeePercentage: params.swapFeePercentage,
    guardian: params.guardian,
    minReliableVaultValue:
      params.minReliableVaultValue || MIN_RELIABLE_VAULT_VALUE,
    minSignificantDepositValue:
      params.minSignificantDepositValue || MIN_SIGNIFICANT_DEPOSIT_VALUE,
    maxOracleSpotDivergence:
      params.maxOracleSpotDivergence || MAX_ORACLE_SPOT_DIVERGENCE,
    maxOracleDelay: params.maxOracleDelay || MAX_ORACLE_DELAY,
    minFeeDuration: params.minFeeDuration || MIN_FEE_DURATION,
    managementFee: params.managementFee || MAX_MANAGEMENT_FEE,
    merkleOrchard: params.merkleOrchard || ZERO_ADDRESS,
    description: params.description || "",
  });
};

export const toWei = (value: number | string): BigNumber =>
  ethers.utils.parseEther(value.toString());

export const toUnit = (
  value: number | string,
  decimals: number,
): BigNumber => {
  return ethers.utils.parseUnits(value.toString(), decimals);
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

export const setNextBlockTimestamp = async (
  timestamp: number,
): Promise<void> => {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
};
