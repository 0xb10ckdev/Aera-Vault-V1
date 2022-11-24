import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { ethers } from "hardhat";
import {
  BalancerVaultMock__factory,
  IERC20,
  ERC4626Mock,
  BaseManagedPoolFactory__factory,
  ManagedPoolFactory,
  ManagedPoolFactory__factory,
  AeraVaultV2Mock,
  AeraVaultV2Mock__factory,
  WithdrawalValidatorMock,
  WithdrawalValidatorMock__factory,
  OracleMock,
} from "../../../typechain";
import {
  MAX_MANAGEMENT_FEE,
  MIN_SWAP_FEE,
  ONE,
  ZERO_ADDRESS,
  MIN_FEE_DURATION,
  MIN_RELIABLE_VAULT_VALUE,
  MIN_SIGNIFICANT_DEPOSIT_VALUE,
  MAX_ORACLE_SPOT_DIVERGENCE,
  MAX_ORACLE_DELAY,
} from "../constants";
import {
  setupTokens,
  setupOracles,
  setupYieldBearingAssets,
} from "../fixtures";
import {
  normalizeWeights,
  toWei,
  tokenValueArray,
  tokenWithValues,
  valueArray,
  toUnit,
} from "../utils";
import {
  testCancelWeightUpdates,
  testClaimManagerFees,
  testDeposit,
  testDepositAndWithdraw,
  testDepositRiskingArbitrage,
  testDisableTrading,
  testEnableTradingRiskingArbitrage,
  testEnableTradingWithOraclePrice,
  testEnableTradingWithWeights,
  testFinalize,
  testFunctionCallsWhenFinalized,
  testFunctionCallsWhenNotInitialized,
  testGetSpotPrices,
  testInitialDeposit,
  testMulticall,
  testOwnership,
  testSetManager,
  testSetOraclesEnabled,
  testSetSwapFee,
  testSweep,
  testUpdateWeightsGradually,
  testWithdraw,
} from "../functions";

describe("Aera Vault V2 Mainnet Functionality", function () {
  let admin: SignerWithAddress;
  let manager: SignerWithAddress;
  let user: SignerWithAddress;
  let vault: AeraVaultV2Mock;
  let validator: WithdrawalValidatorMock;
  let factory: ManagedPoolFactory;
  let poolTokens: IERC20[];
  let tokens: IERC20[];
  let tokenAddresses: string[];
  let yieldTokens: ERC4626Mock[];
  let underlyingIndexes: number[];
  let sortedTokens: string[];
  let unsortedTokens: string[];
  let oracles: OracleMock[];
  let oracleAddresses: string[];
  let snapshot: unknown;

  const getUserBalances = async (address: string) => {
    const balances = await Promise.all(
      tokens.map(token => token.balanceOf(address)),
    );
    return balances;
  };

  const getManagersFeeTotal = async function () {
    const managersFeeTotal = await Promise.all(
      Array.from(Array(tokens.length).keys()).map(index =>
        vault.managersFeeTotal(index),
      ),
    );
    return managersFeeTotal;
  };

  const getState = async (
    managerAddress: string | null = null,
    adminAddress: string | null = null,
  ) => {
    const [holdings, adminBalances, managerBalances] = await Promise.all([
      vault.getHoldings(),
      getUserBalances(adminAddress || admin.address),
      getUserBalances(managerAddress || manager.address),
    ]);

    return {
      holdings,
      adminBalances,
      managerBalances,
    };
  };

  beforeEach(async function () {
    snapshot = await ethers.provider.send("evm_snapshot", []);

    ({ admin, manager, user } = await ethers.getNamedSigners());
    ({
      tokens: poolTokens,
      sortedTokens,
      unsortedTokens,
    } = await setupTokens());
    yieldTokens = await setupYieldBearingAssets(sortedTokens.slice(0, 2));
    underlyingIndexes = [0, 1];
    oracles = await setupOracles();

    tokens = [...poolTokens, ...yieldTokens];
    tokenAddresses = tokens.map(token => token.address);
    unsortedTokens = [
      ...unsortedTokens,
      ...yieldTokens.map(token => token.address),
    ];
    oracleAddresses = oracles.map((oracle: OracleMock) => oracle.address);
    oracleAddresses[0] = ZERO_ADDRESS;

    await Promise.all(
      yieldTokens.map((token, index) =>
        poolTokens[index].approve(token.address, toWei("100000")),
      ),
    );
    await Promise.all(
      yieldTokens.map(token => token.deposit(toWei("100000"), admin.address)),
    );

    const validatorMock =
      await ethers.getContractFactory<WithdrawalValidatorMock__factory>(
        "WithdrawalValidatorMock",
      );

    validator = await validatorMock.connect(admin).deploy(tokens.length);

    const bVaultContract =
      await ethers.getContractFactory<BalancerVaultMock__factory>(
        "BalancerVaultMock",
      );
    const bVault = await bVaultContract.connect(admin).deploy(ZERO_ADDRESS);

    const baseManagedPoolFactoryContract =
      await ethers.getContractFactory<BaseManagedPoolFactory__factory>(
        "BaseManagedPoolFactory",
      );
    const baseManagedPoolFactory = await baseManagedPoolFactoryContract
      .connect(admin)
      .deploy(bVault.address);

    const managedPoolFactoryContract =
      await ethers.getContractFactory<ManagedPoolFactory__factory>(
        "ManagedPoolFactory",
      );
    factory = await managedPoolFactoryContract
      .connect(admin)
      .deploy(baseManagedPoolFactory.address);

    const validWeights = valueArray(
      ONE.div(poolTokens.length),
      poolTokens.length,
    );

    const vaultFactory =
      await ethers.getContractFactory<AeraVaultV2Mock__factory>(
        "AeraVaultV2Mock",
      );
    vault = await vaultFactory.connect(admin).deploy({
      factory: factory.address,
      name: "Test",
      symbol: "TEST",
      poolTokens: sortedTokens,
      weights: validWeights,
      oracles: oracleAddresses,
      yieldTokens: yieldTokens.map((token, index) => ({
        token: token.address,
        underlyingIndex: index,
      })),
      numeraireAssetIndex: 0,
      swapFeePercentage: MIN_SWAP_FEE,
      manager: manager.address,
      validator: validator.address,
      minReliableVaultValue: MIN_RELIABLE_VAULT_VALUE,
      minSignificantDepositValue: MIN_SIGNIFICANT_DEPOSIT_VALUE,
      maxOracleSpotDivergence: MAX_ORACLE_SPOT_DIVERGENCE,
      maxOracleDelay: MAX_ORACLE_DELAY,
      minFeeDuration: MIN_FEE_DURATION,
      managementFee: MAX_MANAGEMENT_FEE,
      merkleOrchard: ZERO_ADDRESS,
      description: "Test vault description",
    });

    this.admin = admin;
    this.manager = manager;
    this.user = user;
    this.vault = vault;
    this.validator = validator;
    this.factory = factory;
    this.poolTokens = poolTokens;
    this.tokens = tokens;
    this.tokenAddresses = tokenAddresses;
    this.yieldTokens = yieldTokens;
    this.underlyingIndexes = underlyingIndexes;
    this.sortedTokens = sortedTokens;
    this.oracles = oracles;
    this.oracleAddresses = oracleAddresses;
    this.unsortedTokens = unsortedTokens;
    this.snapshot = snapshot;

    this.getUserBalances = getUserBalances;
    this.getState = getState;
    this.getManagersFeeTotal = getManagersFeeTotal;
  });

  afterEach(async function () {
    await ethers.provider.send("evm_revert", [snapshot]);
  });

  describe("when Vault not initialized", function () {
    describe("should be reverted to call functions", async function () {
      testFunctionCallsWhenNotInitialized();
    });

    describe("initialize Vault", function () {
      testInitialDeposit();
    });
  });

  describe("when Vault is initialized", function () {
    beforeEach(async function () {
      for (let i = 0; i < tokens.length; i++) {
        await tokens[i].approve(vault.address, toWei(100));
      }

      for (let i = 1; i < poolTokens.length; i++) {
        await oracles[i].setLatestAnswer(toUnit(1, 8));
      }

      await vault.initialDeposit(
        tokenValueArray(tokenAddresses, ONE, tokens.length),
        tokenWithValues(
          tokenAddresses,
          normalizeWeights(valueArray(ONE, tokens.length)),
        ),
      );
    });

    describe("when depositing to Vault", function () {
      describe("with deposit function", async function () {
        testDeposit();
      });

      describe("with depositRiskingArbitrage function", async function () {
        testDepositRiskingArbitrage();
      });
    });

    describe("when withdrawing from Vault", function () {
      testWithdraw();
    });

    describe("when depositing and withdrawing", function () {
      testDepositAndWithdraw();
    });

    describe("when call updateWeightsGradually()", function () {
      testUpdateWeightsGradually();
    });

    describe("when call cancelWeightUpdates()", function () {
      testCancelWeightUpdates();
    });

    describe("when finalize", function () {
      describe("should be reverted to call functions when finalized", async () => {
        testFunctionCallsWhenFinalized();
      });

      describe("initialize Vault", function () {
        testFinalize();
      });
    });

    describe("when enable/disable trading", function () {
      describe("with enableTradingRiskingArbitrage function", function () {
        testEnableTradingRiskingArbitrage();
      });

      describe("with enableTradingWithWeights function", function () {
        testEnableTradingWithWeights();
      });

      describe("with enableTradingWithOraclePrice function", function () {
        testEnableTradingWithOraclePrice();
      });
    });
  });

  describe("Multicall", function () {
    testMulticall();
  });

  describe("Get Spot Prices", function () {
    testGetSpotPrices();
  });

  describe("Sweep", function () {
    testSweep();
  });

  describe("Claim Manager Fees", function () {
    testClaimManagerFees();
  });

  describe("Update Elements", function () {
    describe("Update Manager", function () {
      testSetManager();
    });

    describe("Enable/Disable Oracle", function () {
      testSetOraclesEnabled();
    });

    describe("Disable Trading", function () {
      testDisableTrading();
    });

    describe("Set Swap Fee", function () {
      testSetSwapFee();
    });

    describe("Ownership", function () {
      testOwnership();
    });
  });
});
