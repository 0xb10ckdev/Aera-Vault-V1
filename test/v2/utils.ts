import { BigNumber, BigNumberish, Signer } from "ethers";
import { deployments, ethers } from "hardhat";
import { getChainId, getConfig } from "../../scripts/config";
import {
  AeraVaultV2Mock,
  AeraVaultV2Mock__factory,
  CircuitBreakerLib__factory,
  ControlledManagedPoolFactory,
  ControlledManagedPoolFactory__factory,
  ManagedPoolAddRemoveTokenLib__factory,
  ManagedPoolFactory__factory,
  ProtocolFeePercentagesProvider__factory,
} from "../../typechain";
import { MAX_MANAGEMENT_FEE, ZERO_ADDRESS } from "../v1/constants";
import {
  ONE,
  MIN_FEE_DURATION,
  MAX_ORACLE_DELAY,
  MAX_ORACLE_SPOT_DIVERGENCE,
  MIN_RELIABLE_VAULT_VALUE,
  MIN_SIGNIFICANT_DEPOSIT_VALUE,
} from "./constants";

export type VaultParams = {
  signer: Signer;
  factory: string;
  name: string;
  symbol: string;
  poolTokens: string[];
  weights: string[];
  oracles: string[];
  yieldTokens: { token: string; underlyingIndex: BigNumberish }[];
  numeraireAssetIndex: number;
  swapFeePercentage: BigNumberish;
  manager: string;
  validator?: string;
  minReliableVaultValue?: BigNumberish;
  minSignificantDepositValue?: BigNumberish;
  maxOracleSpotDivergence?: BigNumberish;
  maxOracleDelay?: BigNumberish;
  minFeeDuration?: BigNumberish;
  managementFee?: BigNumberish;
  merkleOrchard?: string;
  description?: string;
};

export * from "../v1/utils";

export const deployFactory = async (
  signer: Signer,
): Promise<ControlledManagedPoolFactory> => {
  const chainId = getChainId(process.env.HARDHAT_FORK);
  const config = getConfig(chainId);

  const addRemoveTokenLibContract =
    await ethers.getContractFactory<ManagedPoolAddRemoveTokenLib__factory>(
      "ManagedPoolAddRemoveTokenLib",
    );
  const circuitBreakerLibContract =
    await ethers.getContractFactory<CircuitBreakerLib__factory>(
      "CircuitBreakerLib",
    );
  const protocolFeeProviderContract =
    await ethers.getContractFactory<ProtocolFeePercentagesProvider__factory>(
      "ProtocolFeePercentagesProvider",
    );
  const controlledManagedPoolFactoryContract =
    await ethers.getContractFactory<ControlledManagedPoolFactory__factory>(
      "ControlledManagedPoolFactory",
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

  const factory = await managedPoolFactoryContract
    .connect(signer)
    .deploy(config.bVault, protocolFeeProvider.address);

  return await controlledManagedPoolFactoryContract
    .connect(signer)
    .deploy(factory.address);
};

export const deployVault = async (
  params: VaultParams,
): Promise<AeraVaultV2Mock> => {
  const vault = await ethers.getContractFactory<AeraVaultV2Mock__factory>(
    "AeraVaultV2Mock",
  );

  if (!params.validator) {
    params.validator = (await deployments.get("Validator")).address;
  }
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
    manager: params.manager,
    validator: params.validator,
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
