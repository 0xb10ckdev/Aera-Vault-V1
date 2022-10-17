import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import hre, { deployments, ethers } from "hardhat";
import { writeFile, rm } from "fs/promises";
import { getConfig } from "../../../scripts/config";
import {
  IERC20,
  ERC4626Mock,
  BaseManagedPoolFactory__factory,
  ManagedPoolFactory,
  ManagedPoolFactory__factory,
  AeraVaultV2Mock,
  WithdrawalValidatorMock,
  WithdrawalValidatorMock__factory,
  OracleMock,
} from "../../../typechain";
import {
  BALANCER_ERRORS,
  DEVIATION,
  MAXIMUM_SWAP_FEE_PERCENT_CHANGE,
  SWAP_FEE_COOLDOWN_PERIOD,
  MAX_MANAGEMENT_FEE,
  MAX_NOTICE_PERIOD,
  MAX_SWAP_FEE,
  MAX_WEIGHT_CHANGE_RATIO,
  MINIMUM_WEIGHT_CHANGE_DURATION,
  MIN_SWAP_FEE,
  MIN_WEIGHT,
  ONE,
  ZERO_ADDRESS,
  PRICE_DEVIATION,
  MIN_FEE_DURATION,
  MIN_RELIABLE_VAULT_VALUE,
  MIN_SIGNIFICANT_DEPOSIT_VALUE,
  MAX_ORACLE_SPOT_DIVERGENCE,
  MAX_ORACLE_DELAY,
} from "../constants";
import {
  deployToken,
  setupTokens,
  setupOracles,
  setupYieldBearingAssets,
} from "../fixtures";
import {
  deployFactory,
  deployVault,
  getCurrentTime,
  getTimestamp,
  increaseTime,
  normalizeWeights,
  toWei,
  tokenValueArray,
  tokenWithValues,
  toUnit,
  valueArray,
  VaultParams,
} from "../utils";

describe("Aera Vault V2 Mainnet Deployment", function () {
  let admin: SignerWithAddress;
  let manager: SignerWithAddress;
  let validator: WithdrawalValidatorMock;
  let factory: ManagedPoolFactory;
  let poolTokens: IERC20[];
  let tokens: IERC20[];
  let yieldTokens: ERC4626Mock[];
  let sortedTokens: string[];
  let unsortedTokens: string[];
  let oracles: OracleMock[];
  let oracleAddress: string[];
  let snapshot: unknown;
  let validWeights: string[];
  let validParams: VaultParams;

  describe("should be reverted to deploy vault", async () => {
    before(async function () {
      snapshot = await ethers.provider.send("evm_snapshot", []);
      ({ admin, manager } = await ethers.getNamedSigners());

      ({
        tokens: poolTokens,
        sortedTokens,
        unsortedTokens,
      } = await setupTokens());
      yieldTokens = await setupYieldBearingAssets(sortedTokens.slice(0, 2));
      oracles = await setupOracles();

      tokens = [...poolTokens, ...yieldTokens];
      oracleAddress = oracles.map((oracle: OracleMock) => oracle.address);
      oracleAddress[0] = ZERO_ADDRESS;
      validWeights = valueArray(ONE.div(poolTokens.length), poolTokens.length);

      await deployments.deploy("Validator", {
        contract: "WithdrawalValidatorMock",
        args: [tokens.length],
        from: admin.address,
        log: true,
      });
      validator = WithdrawalValidatorMock__factory.connect(
        (await deployments.get("Validator")).address,
        admin,
      );

      await deployments.deploy("InvalidValidator", {
        contract: "InvalidValidatorMock",
        from: admin.address,
        log: true,
      });

      factory = await deployFactory(admin);
    });

    beforeEach(async function () {
      const config = getConfig(hre.network.config.chainId || 1);

      validParams = {
        signer: admin,
        factory: factory.address,
        name: "Test",
        symbol: "TEST",
        poolTokens: sortedTokens,
        weights: validWeights,
        oracles: oracleAddress,
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
        merkleOrchard: config.merkleOrchard,
        description: "Test Vault",
      };
    });

    after(async () => {
      await ethers.provider.send("evm_revert", [snapshot]);
    });

    it("when token and weight length is not same", async () => {
      validParams.weights = [...validWeights, validWeights[0]];
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__ValueLengthIsNotSame",
      );
    });

    it("when token and oracle length is not same", async () => {
      validParams.oracles = [...oracleAddress, oracleAddress[0]];
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__OracleLengthIsNotSame",
      );
    });

    it("when numeraire asset index exceeds token length", async () => {
      validParams.numeraireAssetIndex = poolTokens.length;
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__NumeraireAssetIndexExceedsTokenLength",
      );
    });

    it("when oracle is zero address", async () => {
      validParams.oracles = [...oracleAddress.slice(0, -1), ZERO_ADDRESS];
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__OracleIsZeroAddress",
      );
    });

    it("when numeraire oracle is not zero address", async () => {
      validParams.oracles = [oracles[0].address, ...oracleAddress.slice(1)];
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__NumeraireOracleIsNotZeroAddress",
      );
    });

    it("when management fee is greater than maximum", async () => {
      validParams.managementFee = MAX_MANAGEMENT_FEE.add(1);
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__ManagementFeeIsAboveMax",
      );
    });

    it("when minimum fee duration is zero", async () => {
      validParams.minFeeDuration = "0";
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__MinFeeDurationIsZero",
      );
    });

    it("when mininum reliable vault value is zero", async () => {
      validParams.minReliableVaultValue = toWei(0);
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__MinReliableVaultValueIsZero",
      );
    });

    it("when mininum significant vault value is zero", async () => {
      validParams.minSignificantDepositValue = toWei(0);
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__MinSignificantDepositValueIsZero",
      );
    });

    it("when maximum oraclespot divergence is zero", async () => {
      validParams.maxOracleSpotDivergence = toWei(0);
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__MaxOracleSpotDivergenceIsZero",
      );
    });

    it("when maximum oracle delay is zero", async () => {
      validParams.maxOracleDelay = toWei(0);
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__MaxOracleDelayIsZero",
      );
    });

    it("when validator is not valid", async () => {
      validParams.validator = manager.address;
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__ValidatorIsNotValid",
      );

      validParams.validator = (
        await deployments.get("InvalidValidator")
      ).address;
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__ValidatorIsNotValid",
      );
    });

    it("when validator is not matched", async () => {
      const validatorMock =
        await ethers.getContractFactory<WithdrawalValidatorMock__factory>(
          "WithdrawalValidatorMock",
        );
      const mismatchedValidator = await validatorMock
        .connect(admin)
        .deploy(poolTokens.length - 1);
      validParams.validator = mismatchedValidator.address;

      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__ValidatorIsNotMatched",
      );
    });

    it("when token is not sorted in ascending order", async () => {
      const yieldTokensWithUnsortedTokens = await setupYieldBearingAssets(
        unsortedTokens.slice(0, 2),
      );
      validParams.poolTokens = unsortedTokens;
      validParams.yieldTokens = yieldTokensWithUnsortedTokens.map(
        (token, index) => ({
          token: token.address,
          underlyingIndex: index,
        }),
      );

      await expect(deployVault(validParams)).to.be.revertedWith(
        BALANCER_ERRORS.UNSORTED_ARRAY,
      );
    });

    it("when token is duplicated", async () => {
      validParams.poolTokens = [sortedTokens[0], ...sortedTokens.slice(0, -1)];
      const yieldTokensWithDuplicatedTokens = await setupYieldBearingAssets(
        validParams.poolTokens.slice(0, 2),
      );
      validParams.yieldTokens = yieldTokensWithDuplicatedTokens.map(
        (token, index) => ({
          token: token.address,
          underlyingIndex: index,
        }),
      );

      await expect(deployVault(validParams)).to.be.revertedWith(
        BALANCER_ERRORS.UNSORTED_ARRAY,
      );
    });

    it("when swap fee is greater than maximum", async () => {
      validParams.swapFeePercentage = MAX_SWAP_FEE.add(1);
      await expect(deployVault(validParams)).to.be.revertedWith(
        BALANCER_ERRORS.MAX_SWAP_FEE_PERCENTAGE,
      );
    });

    it("when swap fee is less than minimum", async () => {
      validParams.swapFeePercentage = MIN_SWAP_FEE.sub(1);
      await expect(deployVault(validParams)).to.be.revertedWith(
        BALANCER_ERRORS.MIN_SWAP_FEE_PERCENTAGE,
      );
    });

    it("when total sum of weights is not one", async () => {
      validParams.weights = valueArray(MIN_WEIGHT, poolTokens.length);
      await expect(deployVault(validParams)).to.be.revertedWith(
        BALANCER_ERRORS.NORMALIZED_WEIGHT_INVARIANT,
      );
    });

    it("when manager is zero address", async () => {
      validParams.manager = ZERO_ADDRESS;
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__ManagerIsZeroAddress",
      );
    });

    it("when manager is deployer", async () => {
      validParams.manager = admin.address;
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__ManagerIsOwner",
      );
    });

    it("when description is empty", async () => {
      validParams.description = "";
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__DescriptionIsEmpty",
      );
    });
  });
});

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
  let sortedTokens: string[];
  let oracles: OracleMock[];
  let oracleAddresses: string[];
  let unsortedTokens: string[];
  let snapshot: unknown;

  const getUserBalances = async (address: string) => {
    const balances = await Promise.all(
      tokens.map(token => token.balanceOf(address)),
    );
    return balances;
  };

  const getManagersFeeTotal = async () => {
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

    const config = getConfig(hre.network.config.chainId || 1);

    ({ admin, manager, user } = await ethers.getNamedSigners());
    ({
      tokens: poolTokens,
      sortedTokens,
      unsortedTokens,
    } = await setupTokens());
    yieldTokens = await setupYieldBearingAssets(sortedTokens.slice(0, 2));
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
        poolTokens[index].approve(token.address, toWei("10000")),
      ),
    );
    await Promise.all(
      yieldTokens.map(token => token.deposit(toWei("10000"), admin.address)),
    );

    const validatorMock =
      await ethers.getContractFactory<WithdrawalValidatorMock__factory>(
        "WithdrawalValidatorMock",
      );
    const baseManagedPoolFactoryContract =
      await ethers.getContractFactory<BaseManagedPoolFactory__factory>(
        "BaseManagedPoolFactory",
      );
    const managedPoolFactoryContract =
      await ethers.getContractFactory<ManagedPoolFactory__factory>(
        "ManagedPoolFactory",
      );

    validator = await validatorMock.connect(admin).deploy(tokens.length);
    const baseManagedPoolFactory = await baseManagedPoolFactoryContract
      .connect(admin)
      .deploy(config.bVault);
    factory = await managedPoolFactoryContract
      .connect(admin)
      .deploy(baseManagedPoolFactory.address);

    const validWeights = valueArray(
      ONE.div(poolTokens.length),
      poolTokens.length,
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
        yieldTokens: yieldTokens.map(token => token.address),
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
        description: "Test vault description",
      }),
    );

    vault = await hre.run("deploy:vaultV2", {
      configPath: ".testConfig.json",
      silent: true,
      test: true,
    });

    await rm(".testConfig.json");
  });

  afterEach(async () => {
    await ethers.provider.send("evm_revert", [snapshot]);
  });

  describe("when Vault not initialized", () => {
    beforeEach(async () => {
      for (let i = 0; i < tokens.length; i++) {
        await tokens[i].approve(vault.address, toWei(2));
      }
    });

    describe("should be reverted to call functions", async () => {
      it("when call deposit", async () => {
        await expect(
          vault.deposit(tokenValueArray(tokenAddresses, ONE, tokens.length)),
        ).to.be.revertedWith("Aera__VaultNotInitialized");
      });

      it("when call depositIfBalanceUnchanged", async () => {
        await expect(
          vault.depositIfBalanceUnchanged(
            tokenValueArray(tokenAddresses, ONE, tokens.length),
          ),
        ).to.be.revertedWith("Aera__VaultNotInitialized");
      });

      it("when call depositRiskingArbitrage", async () => {
        await expect(
          vault.depositRiskingArbitrage(
            tokenValueArray(tokenAddresses, ONE, tokens.length),
          ),
        ).to.be.revertedWith("Aera__VaultNotInitialized");
      });

      it("when call depositRiskingArbitrageIfBalanceUnchanged", async () => {
        await expect(
          vault.depositRiskingArbitrageIfBalanceUnchanged(
            tokenValueArray(tokenAddresses, ONE, tokens.length),
          ),
        ).to.be.revertedWith("Aera__VaultNotInitialized");
      });

      it("when call withdraw", async () => {
        await expect(
          vault.withdraw(tokenValueArray(tokenAddresses, ONE, tokens.length)),
        ).to.be.revertedWith("Aera__VaultNotInitialized");
      });

      it("when call withdrawIfBalanceUnchanged", async () => {
        await expect(
          vault.withdrawIfBalanceUnchanged(
            tokenValueArray(tokenAddresses, ONE, tokens.length),
          ),
        ).to.be.revertedWith("Aera__VaultNotInitialized");
      });

      it("when call updateWeightsGradually", async () => {
        const blocknumber = await ethers.provider.getBlockNumber();
        await expect(
          vault
            .connect(manager)
            .updateWeightsGradually(
              tokenWithValues(
                tokenAddresses,
                normalizeWeights(valueArray(ONE, tokens.length)),
              ),
              blocknumber + 1,
              blocknumber + 1000,
            ),
        ).to.be.revertedWith("Aera__VaultNotInitialized");
      });

      it("when call cancelWeightUpdates", async () => {
        await expect(
          vault.connect(manager).cancelWeightUpdates(),
        ).to.be.revertedWith("Aera__VaultNotInitialized");
      });

      it("when call claimManagerFees", async () => {
        await expect(
          vault.connect(manager).claimManagerFees(),
        ).to.be.revertedWith("Aera__VaultNotInitialized");
      });

      it("when call finalize", async () => {
        await expect(vault.finalize()).to.be.revertedWith(
          "Aera__VaultNotInitialized",
        );
      });
    });

    describe("should be reverted to initialize the vault", async () => {
      it("when token and amount length is not same", async () => {
        await expect(
          vault.initialDeposit(
            tokenValueArray(sortedTokens, ONE, tokens.length + 1),
            tokenWithValues(
              tokenAddresses,
              normalizeWeights(valueArray(ONE, tokens.length)),
            ),
          ),
        ).to.be.revertedWith("Aera__ValueLengthIsNotSame");
      });

      it("when token is not sorted", async () => {
        await expect(
          vault.initialDeposit(
            tokenValueArray(unsortedTokens, ONE, poolTokens.length),
            tokenWithValues(
              tokenAddresses,
              normalizeWeights(valueArray(ONE, tokens.length)),
            ),
          ),
        ).to.be.revertedWith("Aera__DifferentTokensInPosition");
      });

      it("when amount exceeds allowance", async () => {
        const validAmounts = tokenValueArray(
          sortedTokens,
          ONE,
          poolTokens.length,
        );

        await expect(
          vault.initialDeposit(
            [
              {
                token: sortedTokens[0],
                value: toWei(3),
              },
              ...validAmounts.slice(1),
            ],
            tokenWithValues(
              tokenAddresses,
              normalizeWeights(valueArray(ONE, tokens.length)),
            ),
          ),
        ).to.be.revertedWith("ERC20: insufficient allowance");

        await expect(
          vault.initialDeposit(
            [
              ...validAmounts.slice(0, -1),
              {
                token: sortedTokens[poolTokens.length - 1],
                value: toWei(3),
              },
            ],
            tokenWithValues(
              tokenAddresses,
              normalizeWeights(valueArray(ONE, tokens.length)),
            ),
          ),
        ).to.be.revertedWith("ERC20: insufficient allowance");
      });

      it("when amount is zero", async () => {
        const validAmounts = tokenValueArray(
          sortedTokens,
          ONE,
          poolTokens.length,
        );

        await expect(
          vault.initialDeposit(
            [
              {
                token: sortedTokens[0],
                value: 0,
              },
              ...validAmounts.slice(1),
            ],
            tokenWithValues(
              tokenAddresses,
              normalizeWeights(valueArray(ONE, tokens.length)),
            ),
          ),
        ).to.be.revertedWith(BALANCER_ERRORS.ZERO_INVARIANT);

        await expect(
          vault.initialDeposit(
            [
              ...validAmounts.slice(0, -1),
              {
                token: sortedTokens[poolTokens.length - 1],
                value: 0,
              },
            ],
            tokenWithValues(
              tokenAddresses,
              normalizeWeights(valueArray(ONE, tokens.length)),
            ),
          ),
        ).to.be.revertedWith(BALANCER_ERRORS.ZERO_INVARIANT);
      });
    });

    it("should be possible to initialize the vault", async () => {
      const balances = await getUserBalances(admin.address);
      const normalizedWeights = normalizeWeights(
        valueArray(ONE, tokens.length),
      );

      await vault.initialDeposit(
        tokenValueArray(sortedTokens, ONE, poolTokens.length),
        tokenWithValues(tokenAddresses, normalizedWeights),
      );

      const underlyingTotalWeights = [...normalizedWeights];
      yieldTokens.forEach((_, index) => {
        underlyingTotalWeights[index] = underlyingTotalWeights[index].add(
          normalizedWeights[index + poolTokens.length],
        );
      });

      const { holdings, adminBalances: newAdminBalances } = await getState();
      const poolHoldings = valueArray(ONE, poolTokens.length);
      for (let i = 0; i < yieldTokens.length; i++) {
        const underlyingBalance = ONE.mul(
          normalizedWeights[i + poolTokens.length],
        ).div(underlyingTotalWeights[i]);
        poolHoldings[i] = BigNumber.from(poolHoldings[i])
          .sub(underlyingBalance)
          .toString();

        expect(
          await yieldTokens[i].convertToAssets(
            await yieldTokens[i].balanceOf(vault.address),
          ),
        ).to.equal(underlyingBalance);
      }
      for (let i = 0; i < poolTokens.length; i++) {
        expect(newAdminBalances[i]).to.equal(balances[i].sub(ONE));
        expect(holdings[i]).to.equal(poolHoldings[i]);
      }
    });
  });

  describe("when Vault is initialized", () => {
    beforeEach(async () => {
      for (let i = 0; i < tokens.length; i++) {
        await tokens[i].approve(vault.address, toWei(100));
      }

      for (let i = 1; i < poolTokens.length; i++) {
        await oracles[i].setLatestAnswer(ONE.div(1e10));
      }

      await vault.initialDeposit(
        tokenValueArray(sortedTokens, ONE, poolTokens.length),
        tokenWithValues(
          tokenAddresses,
          normalizeWeights(valueArray(ONE, tokens.length)),
        ),
      );
    });

    it("should be reverted to initialize the vault again", async () => {
      await expect(
        vault.initialDeposit(
          tokenValueArray(sortedTokens, ONE, poolTokens.length),
          tokenWithValues(
            tokenAddresses,
            normalizeWeights(valueArray(ONE, tokens.length)),
          ),
        ),
      ).to.be.revertedWith("Aera__VaultIsAlreadyInitialized");
    });

    describe("when depositing to Vault", () => {
      describe("with deposit function", async () => {
        describe("should be reverted to deposit tokens", async () => {
          it("when called from non-owner", async () => {
            await expect(
              vault
                .connect(user)
                .deposit(tokenValueArray(tokenAddresses, ONE, tokens.length)),
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("when token and amount length is not same", async () => {
            await expect(
              vault.deposit(
                tokenValueArray(tokenAddresses, ONE, tokens.length + 1),
              ),
            ).to.be.revertedWith("Aera__ValueLengthIsNotSame");
          });

          it("when token is not sorted", async () => {
            await expect(
              vault.deposit(
                tokenValueArray(unsortedTokens, ONE, tokens.length),
              ),
            ).to.be.revertedWith("Aera__DifferentTokensInPosition");
          });

          it("when amount exceeds allowance", async () => {
            const spotPrices = await vault.getSpotPrices(sortedTokens[0]);
            for (let i = 1; i < poolTokens.length; i++) {
              await oracles[i].setLatestAnswer(spotPrices[i].div(1e10));
            }
            await expect(
              vault.deposit(
                tokenValueArray(tokenAddresses, toWei(100), tokens.length),
              ),
            ).to.be.revertedWith("ERC20: insufficient allowance");
          });

          it("when oracle is disabled", async () => {
            const spotPrices = await vault.getSpotPrices(sortedTokens[0]);
            for (let i = 1; i < poolTokens.length; i++) {
              await oracles[i].setLatestAnswer(spotPrices[i].div(1e10));
            }

            const amounts = tokens.map(_ =>
              toWei(Math.floor(10 + Math.random() * 10)),
            );

            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, amounts[i]);
            }

            await vault.setOraclesEnabled(false);
            await expect(
              vault.deposit(tokenWithValues(tokenAddresses, amounts)),
            ).to.be.revertedWith("Aera__OraclesAreDisabled");
          });

          it("when oracle is delayed beyond maximum", async () => {
            const timestamp = await getCurrentTime();
            const spotPrices = await vault.getSpotPrices(sortedTokens[0]);
            for (let i = 1; i < poolTokens.length; i++) {
              await oracles[i].setLatestAnswer(spotPrices[i].div(1e10));
              await oracles[i].setUpdatedAt(timestamp - MAX_ORACLE_DELAY);
            }

            const amounts = tokens.map(_ =>
              toWei(Math.floor(10 + Math.random() * 10)),
            );

            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, amounts[i]);
            }

            await expect(
              vault.deposit(tokenWithValues(tokenAddresses, amounts)),
            ).to.be.revertedWith("Aera__OracleIsDelayedBeyondMax");
          });

          it("when oracle and spot price divergence exceeds maximum", async () => {
            const spotPrices = await vault.getSpotPrices(sortedTokens[0]);
            for (let i = 1; i < poolTokens.length; i++) {
              await oracles[i].setLatestAnswer(
                spotPrices[i]
                  .mul(ONE)
                  .div(MAX_ORACLE_SPOT_DIVERGENCE.add(1))
                  .div(1e10),
              );
            }

            const amounts = tokens.map(_ =>
              toWei(Math.floor(10 + Math.random() * 10)),
            );

            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, amounts[i]);
            }

            await expect(
              vault.deposit(tokenWithValues(tokenAddresses, amounts)),
            ).to.be.revertedWith("Aera__OracleSpotPriceDivergenceExceedsMax");
          });

          it("when oracle price is not greater than zero", async () => {
            await oracles[1].setLatestAnswer(0);

            const amounts = tokens.map(_ =>
              toWei(Math.floor(10 + Math.random() * 10)),
            );

            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, amounts[i]);
            }

            await expect(
              vault.deposit(tokenWithValues(tokenAddresses, amounts)),
            ).to.be.revertedWith("Aera__OraclePriceIsInvalid");
          });

          it("when balance is changed in the same block", async () => {
            const spotPrices = await vault.getSpotPrices(sortedTokens[0]);
            for (let i = 1; i < poolTokens.length; i++) {
              await oracles[i].setLatestAnswer(spotPrices[i].div(1e10));
            }

            const amounts = valueArray(toWei(0.1), tokens.length);

            await ethers.provider.send("evm_setAutomine", [false]);

            const trx1 = await vault.deposit(
              tokenWithValues(tokenAddresses, amounts),
            );
            const trx2 = await vault.depositIfBalanceUnchanged(
              tokenWithValues(tokenAddresses, amounts),
            );

            await ethers.provider.send("evm_mine", []);

            try {
              await Promise.all([trx1.wait(), trx2.wait()]);
            } catch {
              // empty
            }

            const [receipt1, receipt2] = await Promise.all([
              ethers.provider.getTransactionReceipt(trx1.hash),
              ethers.provider.getTransactionReceipt(trx2.hash),
            ]);

            expect(receipt1.status).to.equal(1);
            expect(receipt2.status).to.equal(0);

            await ethers.provider.send("evm_setAutomine", [true]);
          });
        });

        describe("should be possible to deposit tokens", async () => {
          it("when vault value is less than minimum", async () => {
            await validator.setAllowances(valueArray(ONE, tokens.length));
            await vault.withdraw(
              tokenValueArray(tokenAddresses, toWei(0.3), tokens.length),
            );

            const spotPrices = await vault.getSpotPrices(sortedTokens[0]);
            const oraclePrices: BigNumber[] = [ONE];
            for (let i = 1; i < poolTokens.length; i++) {
              oraclePrices.push(
                spotPrices[i]
                  .mul(ONE)
                  .div(MAX_ORACLE_SPOT_DIVERGENCE.sub(toWei(0.05)))
                  .div(1e10),
              );
              await oracles[i].setLatestAnswer(oraclePrices[i]);
            }

            const amounts = tokens.map(_ =>
              toWei(Math.floor(10 + Math.random())),
            );

            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, amounts[i]);
            }

            await vault.deposit(tokenWithValues(tokenAddresses, amounts));

            const newSpotPrices = await vault.getSpotPrices(sortedTokens[0]);

            for (let i = 1; i < poolTokens.length; i++) {
              expect(newSpotPrices[i]).to.be.closeTo(
                oraclePrices[i].mul(1e10),
                oraclePrices[i]
                  .mul(1e10)
                  .mul(PRICE_DEVIATION)
                  .div(ONE)
                  .toNumber(),
              );
            }
          });

          it("when deposit value is less than minimum", async () => {
            const spotPrices = await vault.getSpotPrices(sortedTokens[0]);
            const oraclePrices: BigNumber[] = [ONE];
            for (let i = 1; i < poolTokens.length; i++) {
              oraclePrices.push(
                spotPrices[i]
                  .mul(ONE)
                  .div(MAX_ORACLE_SPOT_DIVERGENCE.sub(toWei(0.05)))
                  .div(1e10),
              );
              await oracles[i].setLatestAnswer(oraclePrices[i]);
            }

            const amounts = tokens.map(_ =>
              toWei(Math.floor(1 + Math.random())),
            );

            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, amounts[i]);
            }

            await vault.deposit(tokenWithValues(tokenAddresses, amounts));

            const newSpotPrices = await vault.getSpotPrices(sortedTokens[0]);

            for (let i = 1; i < poolTokens.length; i++) {
              expect(newSpotPrices[i]).to.be.closeTo(
                spotPrices[i],
                spotPrices[i].mul(PRICE_DEVIATION).div(ONE).toNumber(),
              );
            }
          });

          it("when vault value and deposit value are greater than minimum", async () => {
            const spotPrices = await vault.getSpotPrices(sortedTokens[0]);
            const oraclePrices: BigNumber[] = [ONE];
            for (let i = 1; i < poolTokens.length; i++) {
              oraclePrices.push(
                spotPrices[i]
                  .mul(ONE)
                  .div(MAX_ORACLE_SPOT_DIVERGENCE.sub(toWei(0.05)))
                  .div(1e10),
              );
              await oracles[i].setLatestAnswer(oraclePrices[i]);
            }

            const amounts = tokens.map(_ =>
              toWei(Math.floor(5 + Math.random() * 10)),
            );

            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, amounts[i]);
            }

            await vault.deposit(tokenWithValues(tokenAddresses, amounts));

            const newSpotPrices = await vault.getSpotPrices(sortedTokens[0]);

            for (let i = 1; i < poolTokens.length; i++) {
              expect(newSpotPrices[i]).to.be.closeTo(
                oraclePrices[i].mul(1e10),
                oraclePrices[i]
                  .mul(1e10)
                  .mul(PRICE_DEVIATION)
                  .div(ONE)
                  .toNumber(),
              );
            }
          });
        });
      });

      describe("with depositRiskingArbitrage function", async () => {
        describe("should be reverted to deposit tokens", async () => {
          it("when called from non-owner", async () => {
            await expect(
              vault
                .connect(user)
                .depositRiskingArbitrage(
                  tokenValueArray(tokenAddresses, ONE, tokens.length),
                ),
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("when token and amount length is not same", async () => {
            await expect(
              vault.depositRiskingArbitrage(
                tokenValueArray(tokenAddresses, ONE, tokens.length + 1),
              ),
            ).to.be.revertedWith("Aera__ValueLengthIsNotSame");
          });

          it("when token is not sorted", async () => {
            await expect(
              vault.depositRiskingArbitrage(
                tokenValueArray(unsortedTokens, ONE, tokens.length),
              ),
            ).to.be.revertedWith("Aera__DifferentTokensInPosition");
          });

          it("when amount exceeds allowance", async () => {
            await expect(
              vault.depositRiskingArbitrage(
                tokenValueArray(tokenAddresses, toWei(100), tokens.length),
              ),
            ).to.be.revertedWith("ERC20: insufficient allowance");
          });

          it("when balance is changed in the same block", async () => {
            const amounts = tokens.map(_ =>
              toWei(Math.floor(10 + Math.random() * 10)),
            );

            await ethers.provider.send("evm_setAutomine", [false]);

            const trx1 = await vault.depositRiskingArbitrage(
              tokenWithValues(tokenAddresses, amounts),
            );
            const trx2 = await vault.depositRiskingArbitrageIfBalanceUnchanged(
              tokenWithValues(tokenAddresses, amounts),
            );

            await ethers.provider.send("evm_mine", []);

            try {
              await Promise.all([trx1.wait(), trx2.wait()]);
            } catch {
              // empty
            }

            const [receipt1, receipt2] = await Promise.all([
              ethers.provider.getTransactionReceipt(trx1.hash),
              ethers.provider.getTransactionReceipt(trx2.hash),
            ]);

            expect(receipt1.status).to.equal(1);
            expect(receipt2.status).to.equal(0);

            await ethers.provider.send("evm_setAutomine", [true]);
          });
        });

        describe("should be possible to deposit tokens", async () => {
          it("when depositing one token", async () => {
            let { holdings, adminBalances } = await getState();
            let managersFeeTotal = await getManagersFeeTotal();

            for (let i = 0; i < tokens.length; i++) {
              const amounts = new Array(tokens.length).fill(0);
              amounts[i] = toWei(5);

              const spotPrices =
                i < poolTokens.length
                  ? await vault.getSpotPrices(sortedTokens[i])
                  : [];

              await vault.depositRiskingArbitrage(
                tokenWithValues(tokenAddresses, amounts),
              );
              const newManagersFeeTotal = await getManagersFeeTotal();

              const {
                holdings: newHoldings,
                adminBalances: newAdminBalances,
              } = await getState();

              if (i < poolTokens.length) {
                const newSpotPrices = await vault.getSpotPrices(
                  sortedTokens[i],
                );
                for (let j = 0; j < poolTokens.length; j++) {
                  expect(newSpotPrices[j]).to.closeTo(
                    spotPrices[j],
                    spotPrices[j].mul(PRICE_DEVIATION).div(ONE).toNumber(),
                  );
                }
              }
              for (let j = 0; j < tokens.length; j++) {
                expect(newHoldings[j]).to.equal(
                  holdings[j]
                    .add(amounts[j])
                    .sub(newManagersFeeTotal[j])
                    .add(managersFeeTotal[j]),
                );
                expect(newAdminBalances[j]).to.equal(
                  adminBalances[j].sub(amounts[j]),
                );
              }

              holdings = newHoldings;
              adminBalances = newAdminBalances;
              managersFeeTotal = newManagersFeeTotal;
            }
          });

          it("when depositing tokens", async () => {
            const { holdings, adminBalances } = await getState();

            const amounts = tokens.map(_ =>
              toWei(Math.floor(10 + Math.random() * 10)),
            );

            const spotPrices = [];
            for (let i = 0; i < poolTokens.length; i++) {
              spotPrices.push(await vault.getSpotPrices(sortedTokens[i]));
            }
            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, amounts[i]);
            }

            await vault.depositRiskingArbitrage(
              tokenWithValues(tokenAddresses, amounts),
            );
            const managersFeeTotal = await getManagersFeeTotal();

            const { holdings: newHoldings, adminBalances: newAdminBalances } =
              await getState();

            for (let i = 0; i < poolTokens.length; i++) {
              const newSpotPrices = await vault.getSpotPrices(sortedTokens[i]);

              expect(
                await vault.getSpotPrice(
                  sortedTokens[i],
                  sortedTokens[(i + 1) % poolTokens.length],
                ),
              ).to.equal(newSpotPrices[(i + 1) % poolTokens.length]);

              for (let j = 0; j < poolTokens.length; j++) {
                expect(newSpotPrices[j]).to.be.closeTo(
                  spotPrices[i][j],
                  spotPrices[i][j].mul(PRICE_DEVIATION).div(ONE).toNumber(),
                );
              }
            }
            for (let i = 0; i < tokens.length; i++) {
              expect(await vault.holding(i)).to.equal(newHoldings[i]);
              expect(newHoldings[i]).to.equal(
                holdings[i].add(amounts[i]).sub(managersFeeTotal[i]),
              );
              expect(newAdminBalances[i]).to.equal(
                adminBalances[i].sub(amounts[i]),
              );
            }
          });
        });
      });
    });

    describe("when withdrawing from Vault", () => {
      describe("when allowance on validator is invalid", () => {
        it("should revert to withdraw tokens", async () => {
          await expect(
            vault.withdraw(
              tokenValueArray(tokenAddresses, toWei(5), tokens.length),
            ),
          ).to.be.revertedWith("Aera__AmountExceedAvailable");
        });
      });

      describe("when allowance on validator is valid", () => {
        beforeEach(async () => {
          await validator.setAllowances(
            valueArray(toWei(100000), tokens.length),
          );
        });

        describe("should be reverted to withdraw tokens", async () => {
          it("when called from non-owner", async () => {
            await expect(
              vault
                .connect(user)
                .withdraw(tokenValueArray(tokenAddresses, ONE, tokens.length)),
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("when token and amount length is not same", async () => {
            await expect(
              vault.withdraw(
                tokenValueArray(tokenAddresses, ONE, tokens.length + 1),
              ),
            ).to.be.revertedWith("Aera__ValueLengthIsNotSame");
          });

          it("when token is not sorted", async () => {
            await expect(
              vault.withdraw(
                tokenValueArray(unsortedTokens, ONE, tokens.length),
              ),
            ).to.be.revertedWith("Aera__DifferentTokensInPosition");
          });

          it("when amount exceeds holdings", async () => {
            const { holdings } = await getState();
            await expect(
              vault.withdraw([
                {
                  token: tokenAddresses[0],
                  value: holdings[0].add(1),
                },
                ...tokenValueArray(
                  tokenAddresses.slice(1),
                  ONE,
                  tokens.length - 1,
                ),
              ]),
            ).to.be.revertedWith("Aera__AmountExceedAvailable");
          });

          it("when balance is changed in the same block", async () => {
            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, toWei(100000));
            }
            await vault.depositRiskingArbitrage(
              tokenValueArray(tokenAddresses, toWei(10000), tokens.length),
            );

            const amounts = tokens.map(_ =>
              toWei(Math.floor(10 + Math.random() * 10)),
            );

            await ethers.provider.send("evm_setAutomine", [false]);

            const trx1 = await vault.withdraw(
              tokenWithValues(tokenAddresses, amounts),
            );
            const trx2 = await vault.withdrawIfBalanceUnchanged(
              tokenWithValues(tokenAddresses, amounts),
            );

            await ethers.provider.send("evm_mine", []);

            try {
              await Promise.all([trx1.wait(), trx2.wait()]);
            } catch (e) {
              // empty
            }

            const [receipt1, receipt2] = await Promise.all([
              ethers.provider.getTransactionReceipt(trx1.hash),
              ethers.provider.getTransactionReceipt(trx2.hash),
            ]);

            expect(receipt1.status).to.equal(1);
            expect(receipt2.status).to.equal(0);

            await ethers.provider.send("evm_setAutomine", [true]);
          });
        });

        describe("should be possible to withdraw ", async () => {
          it("when withdrawing one token", async () => {
            await vault.depositRiskingArbitrage(
              tokenValueArray(tokenAddresses, toWei(5), tokens.length),
            );
            let { holdings, adminBalances } = await getState();
            let managersFeeTotal = await getManagersFeeTotal();

            for (let i = 0; i < tokens.length; i++) {
              const amounts = new Array(tokens.length).fill(0);
              amounts[i] = toWei(5);

              const spotPrices =
                i < poolTokens.length
                  ? await vault.getSpotPrices(sortedTokens[i])
                  : [];

              await vault.withdraw(tokenWithValues(tokenAddresses, amounts));
              const newManagersFeeTotal = await getManagersFeeTotal();

              if (i < poolTokens.length) {
                const newSpotPrices = await vault.getSpotPrices(
                  sortedTokens[i],
                );
                for (let j = 0; j < poolTokens.length; j++) {
                  expect(newSpotPrices[j]).to.closeTo(
                    spotPrices[j],
                    spotPrices[j].mul(PRICE_DEVIATION).div(ONE).toNumber(),
                  );
                }
              }

              const {
                holdings: newHoldings,
                adminBalances: newAdminBalances,
              } = await getState();

              for (let j = 0; j < tokens.length; j++) {
                expect(newHoldings[j]).to.equal(
                  holdings[j]
                    .sub(amounts[j])
                    .sub(newManagersFeeTotal[j])
                    .add(managersFeeTotal[j]),
                );
                expect(newAdminBalances[j]).to.equal(
                  adminBalances[j].add(amounts[j]),
                );
              }

              holdings = newHoldings;
              adminBalances = newAdminBalances;
              managersFeeTotal = newManagersFeeTotal;
            }
          });

          it("when withdrawing tokens", async () => {
            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, toWei(100000));
            }
            await vault.depositRiskingArbitrage(
              tokenValueArray(tokenAddresses, toWei(10000), tokens.length),
            );

            const { holdings, adminBalances } = await getState();
            const managersFeeTotal = await getManagersFeeTotal();

            const amounts = tokens.map(_ =>
              toWei(Math.floor(10 + Math.random() * 10)),
            );

            const spotPrices = [];
            for (let i = 0; i < poolTokens.length; i++) {
              spotPrices.push(await vault.getSpotPrices(sortedTokens[i]));
            }

            await vault.withdraw(tokenWithValues(tokenAddresses, amounts));
            const newManagersFeeTotal = await getManagersFeeTotal();

            const { holdings: newHoldings, adminBalances: newAdminBalances } =
              await getState();

            for (let i = 0; i < poolTokens.length; i++) {
              const newSpotPrices = await vault.getSpotPrices(sortedTokens[i]);

              expect(
                await vault.getSpotPrice(
                  sortedTokens[i],
                  sortedTokens[(i + 1) % poolTokens.length],
                ),
              ).to.equal(newSpotPrices[(i + 1) % poolTokens.length]);

              for (let j = 0; j < poolTokens.length; j++) {
                expect(newSpotPrices[j]).to.be.closeTo(
                  spotPrices[i][j],
                  spotPrices[i][j].mul(PRICE_DEVIATION).div(ONE).toNumber(),
                );
              }
            }
            for (let i = 0; i < tokens.length; i++) {
              expect(await vault.holding(i)).to.equal(newHoldings[i]);
              expect(newHoldings[i]).to.equal(
                holdings[i]
                  .sub(amounts[i])
                  .sub(newManagersFeeTotal[i])
                  .add(managersFeeTotal[i]),
              );
              expect(newAdminBalances[i]).to.equal(
                adminBalances[i].add(amounts[i]),
              );
            }
          });
        });
      });
    });

    describe("when depositing and withdrawing", () => {
      beforeEach(async () => {
        await validator.setAllowances(
          valueArray(toWei(100000), tokens.length),
        );
      });

      it("should be possible to deposit and withdraw one token", async () => {
        let { holdings, adminBalances } = await getState();
        let managersFeeTotal = await getManagersFeeTotal();

        for (let i = 0; i < tokens.length; i++) {
          const amounts = new Array(tokens.length).fill(0);
          amounts[i] = toWei(5);

          const spotPrices =
            i < poolTokens.length
              ? await vault.getSpotPrices(sortedTokens[i])
              : [];

          await vault.depositRiskingArbitrage(
            tokenWithValues(tokenAddresses, amounts),
          );
          await vault.withdraw(tokenWithValues(tokenAddresses, amounts));
          const newManagersFeeTotal = await getManagersFeeTotal();

          if (i < poolTokens.length) {
            const newSpotPrices = await vault.getSpotPrices(sortedTokens[i]);
            for (let j = 0; j < poolTokens.length; j++) {
              expect(newSpotPrices[j]).to.closeTo(
                spotPrices[j],
                spotPrices[j].mul(PRICE_DEVIATION).div(ONE).toNumber(),
              );
            }
          }
          const { holdings: newHoldings, adminBalances: newAdminBalances } =
            await getState();

          for (let j = 0; j < tokens.length; j++) {
            expect(newHoldings[j]).to.equal(
              holdings[j].sub(newManagersFeeTotal[j]).add(managersFeeTotal[j]),
            );
            expect(newAdminBalances[j]).to.equal(adminBalances[j]);
          }

          holdings = newHoldings;
          adminBalances = newAdminBalances;
          managersFeeTotal = newManagersFeeTotal;
        }
      });

      it("should be possible to deposit and withdraw tokens", async () => {
        const { holdings, adminBalances } = await getState();

        const amounts = tokens.map(_ =>
          toWei(Math.floor(10 + Math.random() * 10)),
        );

        const spotPrices = [];
        for (let i = 0; i < poolTokens.length; i++) {
          spotPrices.push(await vault.getSpotPrices(sortedTokens[i]));
        }

        await vault.depositRiskingArbitrage(
          tokenWithValues(tokenAddresses, amounts),
        );
        await vault.withdraw(tokenWithValues(tokenAddresses, amounts));
        const managersFeeTotal = await getManagersFeeTotal();

        const { holdings: newHoldings, adminBalances: newAdminBalances } =
          await getState();

        for (let i = 0; i < poolTokens.length; i++) {
          const newSpotPrices = await vault.getSpotPrices(sortedTokens[i]);

          expect(
            await vault.getSpotPrice(
              sortedTokens[i],
              sortedTokens[(i + 1) % poolTokens.length],
            ),
          ).to.equal(newSpotPrices[(i + 1) % poolTokens.length]);

          for (let j = 0; j < poolTokens.length; j++) {
            expect(newSpotPrices[j]).to.be.closeTo(
              spotPrices[i][j],
              spotPrices[i][j].mul(PRICE_DEVIATION).div(ONE).toNumber(),
            );
          }
        }
        for (let i = 0; i < tokens.length; i++) {
          expect(await vault.holding(i)).to.equal(newHoldings[i]);
          expect(newHoldings[i]).to.equal(
            holdings[i].sub(managersFeeTotal[i]),
          );
          expect(newAdminBalances[i]).to.equal(adminBalances[i]);
        }
      });
    });

    describe("when call updateWeightsGradually()", () => {
      describe("should be reverted to call updateWeightsGradually", async () => {
        it("when called from non-manager", async () => {
          await expect(
            vault.updateWeightsGradually(
              tokenWithValues(
                tokenAddresses,
                normalizeWeights(valueArray(ONE, tokens.length)),
              ),
              0,
              1,
            ),
          ).to.be.revertedWith("Aera__CallerIsNotManager");
        });

        it("when token is not sorted", async () => {
          const timestamp = await getCurrentTime();
          await expect(
            vault
              .connect(manager)
              .updateWeightsGradually(
                tokenWithValues(
                  unsortedTokens,
                  normalizeWeights(valueArray(ONE, tokens.length)),
                ),
                timestamp + 10,
                timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 10,
              ),
          ).to.be.revertedWith("Aera__DifferentTokensInPosition");
        });

        it("when start time is greater than maximum", async () => {
          const timestamp = await getCurrentTime();
          await expect(
            vault
              .connect(manager)
              .updateWeightsGradually(
                tokenWithValues(
                  tokenAddresses,
                  normalizeWeights(valueArray(ONE, tokens.length)),
                ),
                2 ** 32,
                timestamp,
              ),
          ).to.be.revertedWith("Aera__WeightChangeStartTimeIsAboveMax");
        });

        it("when end time is greater than maximum", async () => {
          const timestamp = await getCurrentTime();
          await expect(
            vault
              .connect(manager)
              .updateWeightsGradually(
                tokenWithValues(
                  tokenAddresses,
                  normalizeWeights(valueArray(ONE, tokens.length)),
                ),
                timestamp,
                2 ** 32,
              ),
          ).to.be.revertedWith("Aera__WeightChangeEndTimeIsAboveMax");
        });

        it("when end time is earlier than start time", async () => {
          const timestamp = await getCurrentTime();
          await expect(
            vault
              .connect(manager)
              .updateWeightsGradually(
                tokenWithValues(
                  tokenAddresses,
                  normalizeWeights(valueArray(ONE, tokens.length)),
                ),
                timestamp - 2,
                timestamp - 1,
              ),
          ).to.be.revertedWith("Aera__WeightChangeEndBeforeStart");
        });

        it("when duration is less than minimum", async () => {
          const timestamp = await getCurrentTime();
          await expect(
            vault
              .connect(manager)
              .updateWeightsGradually(
                tokenWithValues(
                  tokenAddresses,
                  normalizeWeights(valueArray(ONE, tokens.length)),
                ),
                timestamp,
                timestamp + 1,
              ),
          ).to.be.revertedWith("Aera__WeightChangeDurationIsBelowMin");
        });

        it("when actual duration is less than minimum", async () => {
          const timestamp = await getCurrentTime();
          await expect(
            vault
              .connect(manager)
              .updateWeightsGradually(
                tokenWithValues(
                  tokenAddresses,
                  normalizeWeights(valueArray(ONE, tokens.length)),
                ),
                timestamp - 2,
                timestamp + MINIMUM_WEIGHT_CHANGE_DURATION - 1,
              ),
          ).to.be.revertedWith("Aera__WeightChangeDurationIsBelowMin");
        });

        it("when total sum of weights is not one", async () => {
          const timestamp = await getCurrentTime();
          await expect(
            vault
              .connect(manager)
              .updateWeightsGradually(
                tokenValueArray(
                  tokenAddresses,
                  ONE.div(tokens.length).sub(1),
                  tokens.length,
                ),
                timestamp,
                timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1,
              ),
          ).to.be.revertedWith("Aera__SumOfWeightIsNotOne");
        });

        it("when change ratio is greater than maximum", async () => {
          const timestamp = await getCurrentTime();
          const startWeights = await vault.getNormalizedWeights();
          const targetWeight0 = normalizeWeights(
            startWeights.slice(0, poolTokens.length),
          )[0]
            .mul(ONE)
            .div(MAX_WEIGHT_CHANGE_RATIO + 2)
            .div(MINIMUM_WEIGHT_CHANGE_DURATION + 1);
          const targetWeights = normalizeWeights([
            targetWeight0,
            ...valueArray(
              ONE.sub(targetWeight0).div(poolTokens.length - 1),
              poolTokens.length - 1,
            ),
            ...startWeights.slice(poolTokens.length, tokens.length),
          ]);

          await expect(
            vault
              .connect(manager)
              .updateWeightsGradually(
                tokenWithValues(tokenAddresses, targetWeights),
                timestamp,
                timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1,
              ),
          ).to.be.revertedWith("Aera__WeightChangeRatioIsAboveMax");
        });

        it("when weight is less than minimum", async () => {
          const timestamp = await getCurrentTime();
          const token0TargetWeight = toWei(0.0091);
          const weights = await vault.getNormalizedWeights();
          const validDuration = normalizeWeights(
            weights.slice(0, poolTokens.length),
          )[0]
            .mul(ONE)
            .div(token0TargetWeight)
            .div(MAX_WEIGHT_CHANGE_RATIO)
            .add(10);
          const targetWeights = normalizeWeights([
            token0TargetWeight,
            ...valueArray(
              ONE.sub(token0TargetWeight).div(poolTokens.length - 1),
              poolTokens.length - 1,
            ),
            ...weights.slice(poolTokens.length, tokens.length),
          ]);

          await expect(
            vault
              .connect(manager)
              .updateWeightsGradually(
                tokenWithValues(tokenAddresses, targetWeights),
                timestamp,
                timestamp + validDuration.toNumber() + 1,
              ),
          ).to.be.revertedWith(BALANCER_ERRORS.MIN_WEIGHT);
        });
      });

      it("should be possible to call updateWeightsGradually", async () => {
        const startWeights = await vault.getNormalizedWeights();
        const startPoolWeights = normalizeWeights(
          startWeights.slice(0, poolTokens.length),
        );
        const timestamp = await getCurrentTime();
        const endWeights = [];
        const avgWeights = ONE.div(tokens.length);
        const startTime = timestamp + 10;
        const endTime = timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1000;
        for (let i = 0; i < tokens.length; i += 2) {
          if (i < tokens.length - 1) {
            endWeights.push(avgWeights.add(toWei((i + 1) / 100)));
            endWeights.push(avgWeights.sub(toWei((i + 1) / 100)));
          } else {
            endWeights.push(avgWeights);
          }
        }
        const endPoolWeights = normalizeWeights(
          normalizeWeights(endWeights).slice(0, poolTokens.length),
        );

        await vault
          .connect(manager)
          .updateWeightsGradually(
            tokenWithValues(tokenAddresses, normalizeWeights(endWeights)),
            startTime,
            endTime,
          );

        await increaseTime(MINIMUM_WEIGHT_CHANGE_DURATION);

        const currentWeights = await vault.getNormalizedWeights();
        const currentPoolWeights = normalizeWeights(
          currentWeights.slice(0, poolTokens.length),
        );

        const currentTime = await getCurrentTime();
        const ptcProgress = ONE.mul(currentTime - startTime).div(
          endTime - startTime,
        );

        for (let i = 0; i < poolTokens.length; i++) {
          const weightDelta = endPoolWeights[i]
            .sub(startPoolWeights[i])
            .mul(ptcProgress)
            .div(ONE);
          expect(startPoolWeights[i].add(weightDelta)).to.be.closeTo(
            currentPoolWeights[i],
            DEVIATION,
          );
        }
      });

      describe("should cancel current weight update", async () => {
        it("when deposit tokens", async () => {
          const timestamp = await getCurrentTime();
          const endWeights = [];
          const avgWeights = ONE.div(tokens.length);
          const startTime = timestamp + 10;
          const endTime = timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1000;
          for (let i = 0; i < tokens.length; i += 2) {
            if (i < tokens.length - 1) {
              endWeights.push(avgWeights.add(toWei((i + 1) / 100)));
              endWeights.push(avgWeights.sub(toWei((i + 1) / 100)));
            } else {
              endWeights.push(avgWeights);
            }
          }

          await vault
            .connect(manager)
            .updateWeightsGradually(
              tokenWithValues(tokenAddresses, normalizeWeights(endWeights)),
              startTime,
              endTime,
            );

          await vault.depositRiskingArbitrage(
            tokenValueArray(tokenAddresses, toWei(50), tokens.length),
          );

          const newWeights = await vault.getNormalizedWeights();

          for (let i = 0; i < 1000; i++) {
            await ethers.provider.send("evm_mine", []);
          }

          const currentWeights = await vault.getNormalizedWeights();

          for (let i = 0; i < tokens.length; i++) {
            expect(newWeights[i]).to.equal(currentWeights[i]);
          }
        });

        it("when withdraw tokens", async () => {
          await validator.setAllowances(
            valueArray(toWei(100000), tokens.length),
          );
          await vault.depositRiskingArbitrage(
            tokenValueArray(tokenAddresses, toWei(50), tokens.length),
          );

          const timestamp = await getCurrentTime();
          const endWeights = [];
          const avgWeights = ONE.div(tokens.length);
          const startTime = timestamp + 10;
          const endTime = timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1000;
          for (let i = 0; i < tokens.length; i += 2) {
            if (i < tokens.length - 1) {
              endWeights.push(avgWeights.add(toWei((i + 1) / 100)));
              endWeights.push(avgWeights.sub(toWei((i + 1) / 100)));
            } else {
              endWeights.push(avgWeights);
            }
          }

          await vault
            .connect(manager)
            .updateWeightsGradually(
              tokenWithValues(tokenAddresses, normalizeWeights(endWeights)),
              startTime,
              endTime,
            );

          await vault.withdraw(
            tokenValueArray(tokenAddresses, toWei(50), tokens.length),
          );

          const newWeights = await vault.getNormalizedWeights();

          for (let i = 0; i < 1000; i++) {
            await ethers.provider.send("evm_mine", []);
          }

          const currentWeights = await vault.getNormalizedWeights();

          for (let i = 0; i < tokens.length; i++) {
            expect(newWeights[i]).to.equal(currentWeights[i]);
          }
        });
      });
    });

    describe("when call cancelWeightUpdates()", () => {
      it("should be reverted when called from non-manager", async () => {
        await expect(vault.cancelWeightUpdates()).to.be.revertedWith(
          "Aera__CallerIsNotManager",
        );
      });

      it("should be possible to call cancelWeightUpdates", async () => {
        const timestamp = await getCurrentTime();
        const endWeights = [];
        const avgWeights = ONE.div(tokens.length);
        const startTime = timestamp + 10;
        const endTime = timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1000;
        for (let i = 0; i < tokens.length; i += 2) {
          if (i < tokens.length - 1) {
            endWeights.push(avgWeights.add(toWei((i + 1) / 100)));
            endWeights.push(avgWeights.sub(toWei((i + 1) / 100)));
          } else {
            endWeights.push(avgWeights);
          }
        }

        await vault
          .connect(manager)
          .updateWeightsGradually(
            tokenWithValues(tokenAddresses, normalizeWeights(endWeights)),
            startTime,
            endTime,
          );

        await increaseTime(MINIMUM_WEIGHT_CHANGE_DURATION / 2);

        await vault.connect(manager).cancelWeightUpdates();

        const newWeights = await vault.getNormalizedWeights();

        await increaseTime(MINIMUM_WEIGHT_CHANGE_DURATION / 2);

        const currentWeights = await vault.getNormalizedWeights();

        for (let i = 0; i < tokens.length; i++) {
          expect(newWeights[i]).to.equal(currentWeights[i]);
        }
      });
    });

    describe("when finalize", () => {
      describe("should be reverted to call finalize", async () => {
        it("when called from non-owner", async () => {
          await expect(vault.connect(user).finalize()).to.be.revertedWith(
            "Ownable: caller is not the owner",
          );
        });

        it("when already finalized", async () => {
          await vault.finalize();

          await expect(vault.finalize()).to.be.revertedWith(
            "Aera__VaultIsFinalized",
          );
        });
      });

      describe("should be reverted to call functions when finalized", async () => {
        beforeEach(async () => {
          await vault.finalize();
        });

        it("when call deposit", async () => {
          await expect(
            vault.deposit(tokenValueArray(tokenAddresses, ONE, tokens.length)),
          ).to.be.revertedWith("Aera__VaultIsFinalized");
        });

        it("when call depositIfBalanceUnchanged", async () => {
          await expect(
            vault.depositIfBalanceUnchanged(
              tokenValueArray(tokenAddresses, ONE, tokens.length),
            ),
          ).to.be.revertedWith("Aera__VaultIsFinalized");
        });

        it("when call depositRiskingArbitrage", async () => {
          await expect(
            vault.depositRiskingArbitrage(
              tokenValueArray(tokenAddresses, ONE, tokens.length),
            ),
          ).to.be.revertedWith("Aera__VaultIsFinalized");
        });

        it("when call depositRiskingArbitrageIfBalanceUnchanged", async () => {
          await expect(
            vault.depositRiskingArbitrageIfBalanceUnchanged(
              tokenValueArray(tokenAddresses, ONE, tokens.length),
            ),
          ).to.be.revertedWith("Aera__VaultIsFinalized");
        });

        it("when call withdraw", async () => {
          await expect(
            vault.withdraw(
              tokenValueArray(tokenAddresses, ONE, tokens.length),
            ),
          ).to.be.revertedWith("Aera__VaultIsFinalized");
        });

        it("when call withdrawIfBalanceUnchanged", async () => {
          await expect(
            vault.withdrawIfBalanceUnchanged(
              tokenValueArray(tokenAddresses, ONE, tokens.length),
            ),
          ).to.be.revertedWith("Aera__VaultIsFinalized");
        });

        it("when call updateWeightsGradually", async () => {
          const blocknumber = await ethers.provider.getBlockNumber();
          await expect(
            vault
              .connect(manager)
              .updateWeightsGradually(
                tokenWithValues(
                  tokenAddresses,
                  normalizeWeights(valueArray(MIN_WEIGHT, tokens.length)),
                ),
                blocknumber + 1,
                blocknumber + 1000,
              ),
          ).to.be.revertedWith("Aera__VaultIsFinalized");
        });

        it("when call cancelWeightUpdates", async () => {
          await expect(
            vault.connect(manager).cancelWeightUpdates(),
          ).to.be.revertedWith("Aera__VaultIsFinalized");
        });

        it("when call claimManagerFees", async () => {
          await expect(
            vault.connect(manager).claimManagerFees(),
          ).to.be.revertedWith("Aera__VaultIsFinalized");
        });
      });

      it("should be possible to finalize", async () => {
        const { holdings, adminBalances } = await getState();

        const createdAt = await vault.createdAt();
        const lastFeeCheckpoint = await vault.lastFeeCheckpoint();

        const trx = await vault.finalize();
        expect(await vault.isSwapEnabled()).to.equal(false);

        const currentTime = await getTimestamp(trx.blockNumber);
        const feeIndex =
          Math.max(0, currentTime - lastFeeCheckpoint.toNumber()) +
          Math.max(0, createdAt.toNumber() + MIN_FEE_DURATION - currentTime);

        const newHoldings: BigNumber[] = [];
        holdings.forEach((holding: BigNumber) => {
          newHoldings.push(
            holding.sub(
              holding.mul(MAX_MANAGEMENT_FEE).mul(feeIndex).div(ONE),
            ),
          );
        });

        const newAdminBalances = await getUserBalances(admin.address);

        for (let i = 0; i < tokens.length; i++) {
          expect(newAdminBalances[i]).to.equal(
            adminBalances[i].add(newHoldings[i]),
          );
        }
      });
    });
  });

  describe("Multicall", () => {
    const ABI = [
      "function depositRiskingArbitrage(tuple(address token, uint256 value)[])",
      "function withdraw(tuple(address token, uint256 value)[])",
      "function updateWeightsGradually(tuple(address token, uint256 value)[], uint256 startTime, uint256 endTime)",
      "function disableTrading()",
      "function enableTradingRiskingArbitrage()",
      "function setSwapFee(uint256 newSwapFee)",
    ];
    const iface = new ethers.utils.Interface(ABI);

    describe("should be reverted", async () => {
      it("when data is invalid", async () => {
        await expect(vault.multicall(["0x"])).to.be.revertedWith(
          "Address: low-level delegate call failed",
        );
      });

      it("when vault not initialized", async () => {
        await expect(
          vault.multicall([iface.encodeFunctionData("disableTrading", [])]),
        ).to.be.revertedWith("Aera__VaultNotInitialized()");
      });

      it("when multicall ownable functions from non-owner", async () => {
        await expect(
          vault
            .connect(user)
            .multicall([iface.encodeFunctionData("disableTrading", [])]),
        ).to.be.revertedWith("Aera__CallerIsNotOwnerOrManager()");
      });
    });

    describe("should be possible to multicall", async () => {
      beforeEach(async () => {
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, toWei(100000));
        }

        for (let i = 1; i < poolTokens.length; i++) {
          await oracles[i].setLatestAnswer(ONE.div(1e10));
        }

        await vault.initialDeposit(
          tokenValueArray(sortedTokens, ONE, poolTokens.length),
          tokenWithValues(
            tokenAddresses,
            normalizeWeights(valueArray(ONE, tokens.length)),
          ),
        );
      });

      it("when disable trading, deposit and enable trading", async () => {
        const { holdings, adminBalances } = await getState();

        const amounts = tokens.map(_ =>
          toWei(Math.floor(Math.random() * 100)),
        );

        const spotPrices = [];
        for (let i = 0; i < poolTokens.length; i++) {
          spotPrices.push(await vault.getSpotPrices(sortedTokens[i]));
        }

        await vault.multicall([
          iface.encodeFunctionData("disableTrading", []),
          iface.encodeFunctionData("depositRiskingArbitrage", [
            tokenWithValues(tokenAddresses, amounts),
          ]),
          iface.encodeFunctionData("enableTradingRiskingArbitrage", []),
        ]);

        expect(await vault.isSwapEnabled()).to.equal(true);
        const managersFeeTotal = await getManagersFeeTotal();

        const { holdings: newHoldings, adminBalances: newAdminBalances } =
          await getState();

        for (let i = 0; i < poolTokens.length; i++) {
          const newSpotPrices = await vault.getSpotPrices(sortedTokens[i]);

          expect(
            await vault.getSpotPrice(
              sortedTokens[i],
              sortedTokens[(i + 1) % poolTokens.length],
            ),
          ).to.equal(newSpotPrices[(i + 1) % poolTokens.length]);

          for (let j = 0; j < poolTokens.length; j++) {
            expect(newSpotPrices[j]).to.be.closeTo(
              spotPrices[i][j],
              DEVIATION,
            );
          }
        }
        for (let i = 0; i < tokens.length; i++) {
          expect(await vault.holding(i)).to.equal(newHoldings[i]);
          expect(newHoldings[i]).to.equal(
            holdings[i].add(amounts[i]).sub(managersFeeTotal[i]),
          );
          expect(newAdminBalances[i]).to.equal(
            adminBalances[i].sub(amounts[i]),
          );
        }
      });

      it("when set swap fees and update weights", async () => {
        const newFee = MIN_SWAP_FEE.add(1);
        const startWeights = await vault.getNormalizedWeights();
        const startPoolWeights = normalizeWeights(
          startWeights.slice(0, poolTokens.length),
        );
        const timestamp = await getCurrentTime();
        const endWeights = [];
        const avgWeights = ONE.div(tokens.length);
        const startTime = timestamp + 10;
        const endTime = timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1000;
        for (let i = 0; i < tokens.length; i += 2) {
          if (i < tokens.length - 1) {
            endWeights.push(avgWeights.add(toWei((i + 1) / 100)));
            endWeights.push(avgWeights.sub(toWei((i + 1) / 100)));
          } else {
            endWeights.push(avgWeights);
          }
        }
        const endPoolWeights = normalizeWeights(
          normalizeWeights(endWeights).slice(0, poolTokens.length),
        );

        await vault
          .connect(manager)
          .multicall([
            iface.encodeFunctionData("setSwapFee", [newFee]),
            iface.encodeFunctionData("updateWeightsGradually", [
              tokenWithValues(tokenAddresses, normalizeWeights(endWeights)),
              startTime,
              endTime,
            ]),
          ]);

        expect(await vault.connect(manager).getSwapFee()).to.equal(newFee);
        await increaseTime(MINIMUM_WEIGHT_CHANGE_DURATION);

        const currentWeights = await vault.getNormalizedWeights();
        const currentPoolWeights = normalizeWeights(
          currentWeights.slice(0, poolTokens.length),
        );

        const currentTime = await getCurrentTime();
        const ptcProgress = ONE.mul(currentTime - startTime).div(
          endTime - startTime,
        );

        for (let i = 0; i < poolTokens.length; i++) {
          const weightDelta = endPoolWeights[i]
            .sub(startPoolWeights[i])
            .mul(ptcProgress)
            .div(ONE);
          expect(startPoolWeights[i].add(weightDelta)).to.be.closeTo(
            currentPoolWeights[i],
            DEVIATION,
          );
        }
      });

      it("when disable trading, withdraw and enable trading", async () => {
        await vault.depositRiskingArbitrage(
          tokenValueArray(tokenAddresses, toWei(10000), tokens.length),
        );
        await validator.setAllowances(
          valueArray(toWei(100000), tokens.length),
        );

        const { holdings, adminBalances } = await getState();
        const managersFeeTotal = await getManagersFeeTotal();

        const amounts = tokens.map(_ =>
          toWei(Math.floor(Math.random() * 100)),
        );

        const spotPrices = [];
        for (let i = 0; i < poolTokens.length; i++) {
          spotPrices.push(await vault.getSpotPrices(sortedTokens[i]));
        }

        await vault.multicall([
          iface.encodeFunctionData("disableTrading", []),
          iface.encodeFunctionData("withdraw", [
            tokenWithValues(tokenAddresses, amounts),
          ]),
          iface.encodeFunctionData("enableTradingRiskingArbitrage", []),
        ]);

        expect(await vault.isSwapEnabled()).to.equal(true);
        const newManagersFeeTotal = await getManagersFeeTotal();

        const { holdings: newHoldings, adminBalances: newAdminBalances } =
          await getState();

        for (let i = 0; i < poolTokens.length; i++) {
          const newSpotPrices = await vault.getSpotPrices(sortedTokens[i]);

          expect(
            await vault.getSpotPrice(
              sortedTokens[i],
              sortedTokens[(i + 1) % poolTokens.length],
            ),
          ).to.equal(newSpotPrices[(i + 1) % poolTokens.length]);

          for (let j = 0; j < poolTokens.length; j++) {
            expect(newSpotPrices[j]).to.be.closeTo(
              spotPrices[i][j],
              spotPrices[i][j].mul(PRICE_DEVIATION).div(ONE).toNumber(),
            );
          }
        }
        for (let i = 0; i < tokens.length; i++) {
          expect(await vault.holding(i)).to.equal(newHoldings[i]);
          expect(newHoldings[i]).to.equal(
            holdings[i]
              .sub(amounts[i])
              .sub(newManagersFeeTotal[i])
              .add(managersFeeTotal[i]),
          );
          expect(newAdminBalances[i]).to.equal(
            adminBalances[i].add(amounts[i]),
          );
        }
      });
    });
  });

  describe("Get Spot Prices", () => {
    let TOKEN: IERC20;
    beforeEach(async () => {
      ({ TOKEN } = await deployToken());
      for (let i = 0; i < tokens.length; i++) {
        await tokens[i].approve(vault.address, ONE);
      }

      for (let i = 1; i < poolTokens.length; i++) {
        await oracles[i].setLatestAnswer(ONE.div(1e10));
      }

      await vault.initialDeposit(
        tokenValueArray(sortedTokens, ONE, poolTokens.length),
        tokenWithValues(
          tokenAddresses,
          normalizeWeights(valueArray(ONE, tokens.length)),
        ),
      );
    });

    it("should return zero for invalid token", async () => {
      const spotPrices = await vault.getSpotPrices(TOKEN.address);

      for (let i = 0; i < poolTokens.length; i++) {
        expect(spotPrices[i]).to.equal(toWei(0));
        expect(
          await vault.getSpotPrice(TOKEN.address, sortedTokens[i]),
        ).to.equal(toWei(0));
        expect(
          await vault.getSpotPrice(sortedTokens[i], TOKEN.address),
        ).to.equal(toWei(0));
      }
    });
  });

  describe("Sweep", () => {
    let TOKEN: IERC20;
    beforeEach(async () => {
      ({ TOKEN } = await deployToken());
    });

    describe("should be reverted to withdraw token", async () => {
      beforeEach(async () => {
        await TOKEN.transfer(vault.address, toWei(1000));
      });

      it("when called from non-owner", async () => {
        await expect(
          vault.connect(manager).sweep(TOKEN.address, toWei(1001)),
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("when token is pool token", async () => {
        const poolToken = await vault.pool();
        await expect(vault.sweep(poolToken, ONE)).to.be.revertedWith(
          "Aera__CannotSweepPoolToken",
        );
      });

      it("when amount exceeds balance", async () => {
        await expect(
          vault.sweep(TOKEN.address, toWei(1001)),
        ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
      });
    });

    it("should be possible to withdraw token", async () => {
      const balance = await TOKEN.balanceOf(admin.address);
      await TOKEN.transfer(vault.address, toWei(1000));

      expect(
        await vault.estimateGas.sweep(TOKEN.address, toWei(1000)),
      ).to.below(70000);
      await vault.sweep(TOKEN.address, toWei(1000));

      expect(await TOKEN.balanceOf(vault.address)).to.equal(toWei(0));

      expect(await TOKEN.balanceOf(admin.address)).to.equal(balance);
    });
  });

  describe("Claim Manager Fees", () => {
    beforeEach(async () => {
      for (let i = 0; i < tokens.length; i++) {
        await tokens[i].approve(vault.address, ONE);
      }

      for (let i = 1; i < poolTokens.length; i++) {
        await oracles[i].setLatestAnswer(ONE.div(1e10));
      }

      await vault.initialDeposit(
        tokenValueArray(sortedTokens, ONE, poolTokens.length),
        tokenWithValues(
          tokenAddresses,
          normalizeWeights(valueArray(ONE, tokens.length)),
        ),
      );
    });

    it("should be reverted to claim manager fees when no available fee", async () => {
      for (let i = 0; i < tokens.length; i++) {
        await tokens[i].approve(vault.address, toWei(100000));
      }
      await vault.depositRiskingArbitrage(
        tokenValueArray(tokenAddresses, toWei(10000), tokens.length),
      );

      await expect(vault.claimManagerFees()).to.be.revertedWith(
        "Aera__NoAvailableFeeForCaller",
      );
    });

    describe("should be possible to claim manager fees", async () => {
      it("when called from current manager", async () => {
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, toWei(100000));
        }

        let lastFeeCheckpoint = (await vault.lastFeeCheckpoint()).toNumber();
        let holdings = await vault.getHoldings();
        const managerBalances = await getUserBalances(manager.address);
        const depositTrx = await vault.depositRiskingArbitrage(
          tokenValueArray(tokenAddresses, toWei(10000), tokens.length),
        );

        let currentTime = await getTimestamp(depositTrx.blockNumber);
        const managerFee = holdings.map((holding: BigNumber) =>
          holding
            .mul(currentTime - lastFeeCheckpoint)
            .mul(MAX_MANAGEMENT_FEE)
            .div(ONE),
        );
        lastFeeCheckpoint = currentTime;

        holdings = await vault.getHoldings();

        const trx = await vault.connect(manager).claimManagerFees();

        const newManagerBalances = await getUserBalances(manager.address);

        currentTime = await getTimestamp(trx.blockNumber);
        holdings.forEach((holding: BigNumber, index: number) => {
          managerFee[index] = managerFee[index].add(
            holding
              .mul(currentTime - lastFeeCheckpoint)
              .mul(MAX_MANAGEMENT_FEE)
              .div(ONE),
          );
          expect(newManagerBalances[index]).to.equal(
            managerBalances[index].add(managerFee[index]),
          );
        });
      });

      it("when called from old manager", async () => {
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, toWei(100000));
        }

        let lastFeeCheckpoint = (await vault.lastFeeCheckpoint()).toNumber();
        let holdings = await vault.getHoldings();
        const managerBalances = await getUserBalances(manager.address);
        const depositTrx = await vault.depositRiskingArbitrage(
          tokenValueArray(tokenAddresses, toWei(10000), tokens.length),
        );

        let currentTime = await getTimestamp(depositTrx.blockNumber);
        const managerFee = holdings.map((holding: BigNumber) =>
          holding
            .mul(currentTime - lastFeeCheckpoint)
            .mul(MAX_MANAGEMENT_FEE)
            .div(ONE),
        );
        lastFeeCheckpoint = currentTime;

        holdings = (await getState()).holdings;
        const setManagerTrx = await vault.setManager(user.address);

        currentTime = await getTimestamp(setManagerTrx.blockNumber);
        holdings.forEach((holding: BigNumber, index: number) => {
          managerFee[index] = managerFee[index].add(
            holding
              .mul(currentTime - lastFeeCheckpoint)
              .mul(MAX_MANAGEMENT_FEE)
              .div(ONE),
          );
        });

        await vault.connect(manager).claimManagerFees();

        const newManagerBalances = await getUserBalances(manager.address);

        newManagerBalances.forEach(
          (managerBalance: BigNumber, index: number) => {
            expect(managerBalance).to.equal(
              managerBalances[index].add(managerFee[index]),
            );
          },
        );
      });
    });
  });

  describe("Update Elements", () => {
    describe("Update Manager", () => {
      describe("should be reverted to change manager", async () => {
        it("when called from non-owner", async () => {
          await expect(
            vault.connect(manager).setManager(ZERO_ADDRESS),
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("when parameter(new manager) is zero address", async () => {
          await expect(vault.setManager(ZERO_ADDRESS)).to.be.revertedWith(
            "Aera__ManagerIsZeroAddress",
          );
        });

        it("when parameter(new manager) is owner", async () => {
          await expect(vault.setManager(admin.address)).to.be.revertedWith(
            "Aera__ManagerIsOwner",
          );
        });
      });

      it("should be possible to change manager", async () => {
        expect(await vault.manager()).to.equal(manager.address);
        await vault.setManager(user.address);
        expect(await vault.manager()).to.equal(user.address);
      });
    });

    describe("Enable/Disable Oracle", () => {
      describe("should be reverted to enable/disable oracle", async () => {
        it("when called from non-owner or non-manager", async () => {
          await expect(
            vault.connect(user).setOraclesEnabled(true),
          ).to.be.revertedWith("Aera__CallerIsNotOwnerOrManager");
        });
      });

      it("should be possible to enable/disable oracle", async () => {
        await expect(vault.setOraclesEnabled(true))
          .to.emit(vault, "SetOraclesEnabled")
          .withArgs(true);

        expect(await vault.oraclesEnabled()).to.equal(true);

        await expect(vault.setOraclesEnabled(false))
          .to.emit(vault, "SetOraclesEnabled")
          .withArgs(false);

        expect(await vault.oraclesEnabled()).to.equal(false);
      });
    });

    describe("Enable Trading", () => {
      beforeEach(async () => {
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, ONE);
        }

        for (let i = 1; i < poolTokens.length; i++) {
          await oracles[i].setLatestAnswer(ONE.div(1e10));
        }

        await vault.initialDeposit(
          tokenValueArray(sortedTokens, ONE, poolTokens.length),
          tokenWithValues(
            tokenAddresses,
            normalizeWeights(valueArray(ONE, tokens.length)),
          ),
        );
      });

      describe("with enableTradingRiskingArbitrage function", () => {
        it("should be reverted to enable trading when called from non-owner", async () => {
          await expect(
            vault.connect(manager).enableTradingRiskingArbitrage(),
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("should be possible to enable trading", async () => {
          const weights = await vault.getNormalizedWeights();

          await vault.enableTradingRiskingArbitrage();

          const currentWeights = await vault.getNormalizedWeights();

          expect(await vault.isSwapEnabled()).to.equal(true);
          for (let i = 0; i < tokens.length; i++) {
            expect(weights[i]).to.equal(currentWeights[i]);
          }
        });
      });

      describe("with enableTradingWithWeights function", () => {
        describe("should be reverted to enable trading", () => {
          it("when called from non-owner", async () => {
            await expect(
              vault
                .connect(manager)
                .enableTradingWithWeights(
                  tokenValueArray(
                    tokenAddresses,
                    ONE.div(tokens.length),
                    tokens.length,
                  ),
                ),
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("when token is not sorted", async () => {
            await vault.disableTrading();

            await expect(
              vault.enableTradingWithWeights(
                tokenValueArray(
                  unsortedTokens,
                  ONE.div(tokens.length),
                  tokens.length,
                ),
              ),
            ).to.be.revertedWith("Aera__DifferentTokensInPosition");
          });

          it("when total sum of weights is not one", async () => {
            await vault.disableTrading();

            await expect(
              vault.enableTradingWithWeights(
                tokenValueArray(
                  tokenAddresses,
                  ONE.div(tokens.length).sub(1),
                  tokens.length,
                ),
              ),
            ).to.be.revertedWith("Aera__SumOfWeightIsNotOne");
          });

          it("when swap is already enabled", async () => {
            await expect(
              vault.enableTradingWithWeights(
                tokenValueArray(
                  tokenAddresses,
                  ONE.div(tokens.length),
                  tokens.length,
                ),
              ),
            ).to.be.revertedWith("Aera__PoolSwapIsAlreadyEnabled");
          });
        });

        it("should be possible to enable trading", async () => {
          await vault.disableTrading();

          const endWeights = [];
          const avgWeights = ONE.div(tokens.length);
          for (let i = 0; i < tokens.length; i += 2) {
            if (i < tokens.length - 1) {
              endWeights.push(avgWeights.add(toWei((i + 1) / 100)));
              endWeights.push(avgWeights.sub(toWei((i + 1) / 100)));
            } else {
              endWeights.push(avgWeights);
            }
          }

          await vault.enableTradingWithWeights(
            tokenWithValues(tokenAddresses, normalizeWeights(endWeights)),
          );

          const endPoolWeights = normalizeWeights(
            normalizeWeights(endWeights).slice(0, poolTokens.length),
          );
          const currentWeights = await vault.getNormalizedWeights();
          const currentPoolWeights = normalizeWeights(
            currentWeights.slice(0, poolTokens.length),
          );

          expect(await vault.isSwapEnabled()).to.equal(true);
          for (let i = 0; i < poolTokens.length; i++) {
            expect(endPoolWeights[i]).to.be.closeTo(
              currentPoolWeights[i],
              DEVIATION,
            );
          }
        });
      });

      describe("with enableTradingWithOraclePrice function", () => {
        describe("should be reverted to enable trading", async () => {
          it("when called from non-manager", async () => {
            await expect(
              vault.enableTradingWithOraclePrice(),
            ).to.be.revertedWith("Aera__CallerIsNotManager");
          });

          it("when oracle price is not greater than zero", async () => {
            await oracles[1].setLatestAnswer(0);
            await expect(
              vault.connect(manager).enableTradingWithOraclePrice(),
            ).to.be.revertedWith("Aera__OraclePriceIsInvalid");
          });
        });

        it("should be possible to enable trading", async () => {
          const oraclePrices: BigNumber[] = [toUnit(1, 8)];
          for (let i = 1; i < poolTokens.length; i++) {
            oraclePrices.push(
              toUnit(Math.floor((0.1 + Math.random()) * 50), 8),
            );
            await oracles[i].setLatestAnswer(oraclePrices[i]);
          }

          await expect(vault.connect(manager).enableTradingWithOraclePrice())
            .to.emit(vault, "SetSwapEnabled")
            .withArgs(true);

          for (let i = 0; i < poolTokens.length; i++) {
            expect(
              await vault.getSpotPrice(sortedTokens[i], sortedTokens[0]),
            ).to.be.closeTo(
              oraclePrices[i].mul(1e10),
              oraclePrices[i]
                .mul(1e10)
                .mul(PRICE_DEVIATION)
                .div(ONE)
                .toNumber(),
            );
          }
          expect(await vault.isSwapEnabled()).to.equal(true);
        });
      });
    });

    describe("Disable Trading", () => {
      beforeEach(async () => {
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, ONE);
        }

        for (let i = 1; i < poolTokens.length; i++) {
          await oracles[i].setLatestAnswer(ONE.div(1e10));
        }

        await vault.initialDeposit(
          tokenValueArray(sortedTokens, ONE, poolTokens.length),
          tokenWithValues(
            tokenAddresses,
            normalizeWeights(valueArray(ONE, tokens.length)),
          ),
        );
      });

      it("should be reverted to disable trading", async () => {
        await expect(vault.connect(user).disableTrading()).to.be.revertedWith(
          "Aera__CallerIsNotOwnerOrManager",
        );
      });

      it("should be possible to disable trading", async () => {
        expect(await vault.isSwapEnabled()).to.equal(true);

        expect(await vault.estimateGas.disableTrading()).to.below(52000);
        await vault.connect(manager).disableTrading();

        expect(await vault.isSwapEnabled()).to.equal(false);
      });
    });

    describe("Set Swap Fee", () => {
      describe("should be reverted to set swap fee", async () => {
        it("when called from non-manager", async () => {
          await expect(vault.setSwapFee(toWei(3))).to.be.revertedWith(
            "Aera__CallerIsNotManager()",
          );
        });

        it("when swap fee is greater than balancer maximum", async () => {
          let newFee = await vault.getSwapFee();
          while (newFee.lte(MAX_SWAP_FEE)) {
            await vault.connect(manager).setSwapFee(newFee);
            await increaseTime(SWAP_FEE_COOLDOWN_PERIOD);
            newFee = newFee.add(MAXIMUM_SWAP_FEE_PERCENT_CHANGE);
          }
          await expect(
            vault.connect(manager).setSwapFee(MAX_SWAP_FEE.add(1)),
          ).to.be.revertedWith(BALANCER_ERRORS.MAX_SWAP_FEE_PERCENTAGE);
        });

        it("when swap fee is less than balancer minimum", async () => {
          let newFee = await vault.getSwapFee();
          while (newFee.gte(MIN_SWAP_FEE)) {
            await vault.connect(manager).setSwapFee(newFee);
            await increaseTime(SWAP_FEE_COOLDOWN_PERIOD);
            newFee = newFee.sub(MAXIMUM_SWAP_FEE_PERCENT_CHANGE);
          }
          await expect(
            vault.connect(manager).setSwapFee(MIN_SWAP_FEE.sub(1)),
          ).to.be.revertedWith(BALANCER_ERRORS.MIN_SWAP_FEE_PERCENTAGE);
        });
      });

      it("should be possible to set swap fee", async () => {
        const fee = await vault.getSwapFee();
        const newFee = fee.add(MAXIMUM_SWAP_FEE_PERCENT_CHANGE);
        expect(
          await vault.connect(manager).estimateGas.setSwapFee(newFee),
        ).to.below(90000);
        await vault.connect(manager).setSwapFee(newFee);

        expect(await vault.getSwapFee()).to.equal(newFee);
      });
    });

    describe("Ownership", () => {
      describe("Renounce Ownership", () => {
        describe("should be reverted", () => {
          it("when called from non-owner", async () => {
            await expect(
              vault.connect(user).renounceOwnership(),
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("when called from owner", async () => {
            await expect(vault.renounceOwnership()).to.be.revertedWith(
              "Aera__VaultIsNotRenounceable",
            );
          });
        });
      });

      describe("Offer Ownership Transfer", () => {
        describe("should be reverted", () => {
          it("when called from non-owner", async () => {
            await expect(
              vault.connect(user).transferOwnership(admin.address),
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("when called from not accepted owner", async () => {
            await vault.transferOwnership(user.address);
            await expect(
              vault.connect(user).transferOwnership(admin.address),
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("when transferred ownership", async () => {
            await vault.transferOwnership(user.address);
            await vault.connect(user).acceptOwnership();
            await expect(
              vault.transferOwnership(user.address),
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("when new owner is zero address", async () => {
            await expect(
              vault.transferOwnership(ZERO_ADDRESS),
            ).to.be.revertedWith("Aera__OwnerIsZeroAddress");
          });
        });

        it("should be possible to call", async () => {
          expect(await vault.pendingOwner()).to.equal(ZERO_ADDRESS);
          await vault.transferOwnership(user.address);
          expect(await vault.pendingOwner()).to.equal(user.address);
        });
      });

      describe("Cancel Ownership Transfer", () => {
        describe("should be reverted", () => {
          it("when called from non-owner", async () => {
            await expect(
              vault.connect(user).cancelOwnershipTransfer(),
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("when there is no pending ownership transfer", async () => {
            await expect(vault.cancelOwnershipTransfer()).to.be.revertedWith(
              "Aera__NoPendingOwnershipTransfer",
            );
          });
        });

        it("should be possible to cancel", async () => {
          await vault.transferOwnership(user.address);
          expect(await vault.pendingOwner()).to.equal(user.address);
          await vault.cancelOwnershipTransfer();
          expect(await vault.pendingOwner()).to.equal(ZERO_ADDRESS);
          await expect(
            vault.connect(user).acceptOwnership(),
          ).to.be.revertedWith("Aera__NotPendingOwner");
        });
      });

      describe("Accept Ownership", () => {
        describe("should be reverted", () => {
          it("when called from not pending owner", async () => {
            await vault.transferOwnership(user.address);
            await expect(vault.acceptOwnership()).to.be.revertedWith(
              "Aera__NotPendingOwner",
            );
          });
        });

        it("should be possible to accept", async () => {
          await vault.transferOwnership(user.address);
          expect(await vault.owner()).to.equal(admin.address);
          expect(await vault.pendingOwner()).to.equal(user.address);
          await vault.connect(user).acceptOwnership();
          expect(await vault.owner()).to.equal(user.address);
          await vault.connect(user).transferOwnership(admin.address);
        });
      });
    });
  });
});
