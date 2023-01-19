import { parseEther } from "@ethersproject/units";
import { ethers } from "hardhat";
import {
  AeraVaultV3Mock,
  AeraVaultV3Mock__factory,
  ERC4626Mock,
  IERC20,
  ManagedPoolFactory,
  OracleMock,
  ERC20Mock,
  ERC20Mock__factory,
} from "../../typechain";
import { setupAssetContracts } from "../v2/fixtures";
import {
  MAX_MANAGEMENT_FEE,
  MAX_ORACLE_DELAY,
  MAX_ORACLE_SPOT_DIVERGENCE,
  MIN_FEE_DURATION,
  MIN_RELIABLE_VAULT_VALUE,
  MIN_SIGNIFICANT_DEPOSIT_VALUE,
  MIN_SWAP_FEE,
  MIN_YIELD_ACTION_THRESHOLD,
  ONE,
  ZERO_ADDRESS,
} from "../v2/constants";
import { valueArray } from "./utils";

export type DeployedData = {
  tokens: IERC20[];
  tokenAddresses: string[];
  poolTokens: IERC20[];
  yieldTokens: ERC4626Mock[];
  isWithdrawable: boolean[];
  sortedTokens: string[];
  unsortedTokens: string[];
  underlyingIndexes: number[];
  oracles: OracleMock[];
  oracleAddresses: string[];
  factory: ManagedPoolFactory;
  vault: AeraVaultV3Mock;
};

export const setupTokens = async (): Promise<ERC20Mock[]> => {
  const { admin } = await ethers.getNamedSigners();

  const tokens = [];
  const erc20 = await ethers.getContractFactory<ERC20Mock__factory>(
    "ERC20Mock",
  );

  for (let i = 0; i < 10; i++) {
    const token = await erc20
      .connect(admin)
      .deploy(`TOKEN${i} Test`, `TTOKEN${i}`, 18, parseEther("1000000000"));
    tokens.push(token);
  }

  return tokens;
};

export const setupVaultWithBalancerVault = async (): Promise<DeployedData> => {
  const {
    tokens,
    poolTokens,
    yieldTokens,
    sortedTokens,
    unsortedTokens,
    tokenAddresses,
    underlyingIndexes,
    oracles,
    oracleAddresses,
    factory,
  } = await setupAssetContracts(false);

  const { admin, guardian } = await ethers.getNamedSigners();

  const validWeights = valueArray(
    ONE.div(poolTokens.length),
    poolTokens.length,
  );
  const isWithdrawable = yieldTokens.map(
    (_, index) => index < yieldTokens.length / 2,
  );

  const vaultFactory =
    await ethers.getContractFactory<AeraVaultV3Mock__factory>(
      "AeraVaultV3Mock",
    );
  const vault = await vaultFactory.connect(admin).deploy({
    factory: factory.address,
    name: "Test",
    symbol: "TEST",
    poolTokens: sortedTokens,
    weights: validWeights,
    oracles: oracleAddresses,
    yieldTokens: yieldTokens.map((token, index) => ({
      token: token.address,
      underlyingIndex: index,
      isWithdrawable: isWithdrawable[index],
    })),
    numeraireAssetIndex: 0,
    swapFeePercentage: MIN_SWAP_FEE,
    guardian: guardian.address,
    minReliableVaultValue: MIN_RELIABLE_VAULT_VALUE,
    minSignificantDepositValue: MIN_SIGNIFICANT_DEPOSIT_VALUE,
    minYieldActionThreshold: MIN_YIELD_ACTION_THRESHOLD,
    maxOracleSpotDivergence: MAX_ORACLE_SPOT_DIVERGENCE,
    maxOracleDelay: MAX_ORACLE_DELAY,
    minFeeDuration: MIN_FEE_DURATION,
    managementFee: MAX_MANAGEMENT_FEE,
    merkleOrchard: ZERO_ADDRESS,
    description: "Test vault description",
  });

  return {
    vault,
    factory,
    poolTokens,
    tokens,
    tokenAddresses,
    yieldTokens,
    isWithdrawable,
    underlyingIndexes,
    sortedTokens,
    oracles,
    oracleAddresses,
    unsortedTokens,
  };
};
