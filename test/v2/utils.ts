import { BigNumberish, ContractTransaction, Signer } from "ethers";
import { ethers } from "hardhat";
import { getChainId, getConfig } from "../../scripts/config";
import {
  AeraVaultFactoryV2__factory,
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
  MIN_YIELD_ACTION_THRESHOLD,
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
  minYieldActionThreshold?: BigNumberish;
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
): Promise<ContractTransaction> => {
  const vaultFactory =
    await ethers.getContractFactory<AeraVaultFactoryV2__factory>(
      "AeraVaultFactoryV2",
    );

  const factory = await vaultFactory.connect(params.signer).deploy();

  return await factory.connect(params.signer).create({
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
    minYieldActionThreshold:
      params.minYieldActionThreshold || MIN_YIELD_ACTION_THRESHOLD,
    maxOracleSpotDivergence:
      params.maxOracleSpotDivergence || MAX_ORACLE_SPOT_DIVERGENCE,
    maxOracleDelay: params.maxOracleDelay || MAX_ORACLE_DELAY,
    minFeeDuration: params.minFeeDuration || MIN_FEE_DURATION,
    managementFee: params.managementFee || MAX_MANAGEMENT_FEE,
    merkleOrchard: params.merkleOrchard || ZERO_ADDRESS,
    description: params.description || "",
  });
};
