import { rm, writeFile } from "fs/promises";
import hre, { ethers } from "hardhat";
import { getConfig } from "../../scripts/config";
import {
  AeraVaultV2Mock,
  AeraVaultV2Mock__factory,
  BalancerVaultMock__factory,
  ERC4626Mock,
  ERC4626Mock__factory,
  IERC20,
  ManagedPoolFactory,
  ManagedPoolFactory__factory,
  OracleMock,
  OracleMock__factory,
} from "../../typechain";
import { setupTokens } from "../v1/fixtures";
import {
  MAX_MANAGEMENT_FEE,
  MAX_ORACLE_DELAY,
  MAX_ORACLE_SPOT_DIVERGENCE,
  MIN_FEE_DURATION,
  MIN_RELIABLE_VAULT_VALUE,
  MIN_SIGNIFICANT_DEPOSIT_VALUE,
  MIN_SWAP_FEE,
  ONE,
  ZERO_ADDRESS,
} from "./constants";
import { toWei, valueArray } from "./utils";

export * from "../v1/fixtures";

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
  vault: AeraVaultV2Mock;
};

export const setupAssetContracts = async (
  withBalancerVaultMock: boolean,
): Promise<{
  tokens: IERC20[];
  poolTokens: IERC20[];
  yieldTokens: ERC4626Mock[];
  sortedTokens: string[];
  unsortedTokens: string[];
  tokenAddresses: string[];
  underlyingIndexes: number[];
  oracles: OracleMock[];
  oracleAddresses: string[];
  factory: ManagedPoolFactory;
}> => {
  const { admin } = await ethers.getNamedSigners();
  const {
    tokens: poolTokens,
    sortedTokens,
    unsortedTokens: unsortedPoolTokens,
  } = await setupTokens();
  const yieldTokens = await setupYieldBearingAssets(sortedTokens.slice(0, 2));
  const underlyingIndexes = [0, 1];
  const oracles = await setupOracles();

  const tokens = [...poolTokens, ...yieldTokens];
  const tokenAddresses = tokens.map(token => token.address);
  const unsortedTokens = [
    ...unsortedPoolTokens,
    ...yieldTokens.map(token => token.address),
  ];
  const oracleAddresses = oracles.map((oracle: OracleMock) => oracle.address);
  oracleAddresses[0] = ZERO_ADDRESS;

  await Promise.all(
    yieldTokens.map((token, index) =>
      poolTokens[index].approve(token.address, toWei("100000")),
    ),
  );
  await Promise.all(
    yieldTokens.map(token => token.deposit(toWei("100000"), admin.address)),
  );

  const addRemoveTokenLibContract = await ethers.getContractFactory(
    "ManagedPoolAddRemoveTokenLib",
  );
  const circuitBreakerLibContract = await ethers.getContractFactory(
    "CircuitBreakerLib",
  );

  const addRemoveTokenLib = await addRemoveTokenLibContract
    .connect(admin)
    .deploy();
  const circuitBreakerLib = await circuitBreakerLibContract
    .connect(admin)
    .deploy();

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

  const config = getConfig(hre.network.config.chainId || 1);
  let bVaultAddress: string = config.bVault;

  if (withBalancerVaultMock) {
    const bVaultContract =
      await ethers.getContractFactory<BalancerVaultMock__factory>(
        "BalancerVaultMock",
      );

    const bVault = await bVaultContract.connect(admin).deploy(ZERO_ADDRESS);
    bVaultAddress = bVault.address;
  }

  const protocolFeeProviderContract = await ethers.getContractFactory(
    "ProtocolFeePercentagesProvider",
  );

  const protocolFeeProvider = await protocolFeeProviderContract
    .connect(admin)
    .deploy(bVaultAddress, ONE, ONE);
  const factory = await managedPoolFactoryContract
    .connect(admin)
    .deploy(bVaultAddress, protocolFeeProvider.address);

  return {
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
  };
};

export const setupVaultWithBalancerVaultMock =
  async (): Promise<DeployedData> => {
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
    } = await setupAssetContracts(true);

    const { admin, guardian } = await ethers.getNamedSigners();

    const validWeights = valueArray(
      ONE.div(poolTokens.length),
      poolTokens.length,
    );
    const isWithdrawable = yieldTokens.map(
      (_, index) => index < yieldTokens.length / 2,
    );

    const vaultFactory =
      await ethers.getContractFactory<AeraVaultV2Mock__factory>(
        "AeraVaultV2Mock",
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

  const { guardian } = await ethers.getNamedSigners();

  const validWeights = valueArray(
    ONE.div(poolTokens.length),
    poolTokens.length,
  );
  const isWithdrawable = yieldTokens.map(
    (_, index) => index < yieldTokens.length / 2,
  );

  await writeFile(
    ".testConfig.json",
    JSON.stringify({
      factory: factory.address,
      name: "Test",
      symbol: "TEST",
      poolTokens: sortedTokens,
      weights: validWeights,
      oracles: oracleAddresses,
      yieldTokens: yieldTokens.map((token, index) => ({
        token: token.address,
        isWithdrawable: isWithdrawable[index],
      })),
      numeraireAssetIndex: 0,
      swapFeePercentage: MIN_SWAP_FEE,
      guardian: guardian.address,
      minReliableVaultValue: MIN_RELIABLE_VAULT_VALUE,
      minSignificantDepositValue: MIN_SIGNIFICANT_DEPOSIT_VALUE,
      maxOracleSpotDivergence: MAX_ORACLE_SPOT_DIVERGENCE,
      maxOracleDelay: MAX_ORACLE_DELAY,
      minFeeDuration: MIN_FEE_DURATION,
      managementFee: MAX_MANAGEMENT_FEE,
      description: "Test vault description",
    }),
  );

  const vault = await hre.run("deploy:vaultV2", {
    configPath: ".testConfig.json",
    silent: true,
    test: true,
  });

  await rm(".testConfig.json");

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

export const setupOracles = async (
  length: number = 4,
): Promise<OracleMock[]> => {
  const { admin } = await ethers.getNamedSigners();

  const oracleDeploys = [];
  const oracleFactory = await ethers.getContractFactory<OracleMock__factory>(
    "OracleMock",
  );

  for (let i = 0; i < length; i++) {
    const oracle = await oracleFactory.connect(admin).deploy(8);
    oracleDeploys.push(oracle);
  }

  const oracles = oracleDeploys.map(oracle =>
    OracleMock__factory.connect(oracle.address, admin),
  );

  return oracles;
};

export const setupYieldBearingAssets = async (
  underlyingAssets: string[],
): Promise<ERC4626Mock[]> => {
  const { admin } = await ethers.getNamedSigners();

  const tokenDeploys: ERC4626Mock[] = [];
  const erc4626Mock = await ethers.getContractFactory<ERC4626Mock__factory>(
    "ERC4626Mock",
  );

  for (const underlyingAsset of underlyingAssets) {
    const erc20 = await ethers.getContractAt("ERC20Mock", underlyingAsset);
    const token = await erc4626Mock
      .connect(admin)
      .deploy(
        underlyingAsset,
        `YIELD BEARING ${await erc20.name()}`,
        `YB ${await erc20.symbol()}`,
      );
    tokenDeploys.push(token);
  }

  const tokens = tokenDeploys.map(token =>
    ERC4626Mock__factory.connect(token.address, admin),
  );

  return tokens;
};
