import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
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
  MAXIMUM_SWAP_FEE_PERCENT_CHANGE,
  SWAP_FEE_COOLDOWN_PERIOD,
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
  getCurrentTime,
  getTimestamp,
  increaseTime,
  normalizeWeights,
  toWei,
  tokenValueArray,
  tokenWithValues,
  valueArray,
  toUnit,
} from "../utils";

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

  const getBalances = async () => {
    const balances = await Promise.all(
      tokens.map(token => token.balanceOf(admin.address)),
    );
    return balances;
  };

  const getState = async () => {
    const [holdings, balances] = await Promise.all([
      vault.getHoldings(),
      getBalances(),
    ]);

    return {
      holdings,
      balances,
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
        await expect(vault.claimManagerFees()).to.be.revertedWith(
          "Aera__VaultNotInitialized",
        );
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
            tokenValueArray(tokenAddresses, ONE, tokens.length + 1),
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
            tokenValueArray(unsortedTokens, ONE, tokens.length),
            tokenWithValues(
              tokenAddresses,
              normalizeWeights(valueArray(ONE, tokens.length)),
            ),
          ),
        ).to.be.revertedWith("Aera__DifferentTokensInPosition");
      });

      it("when amount exceeds allowance", async () => {
        const validAmounts = tokenValueArray(
          tokenAddresses,
          ONE,
          tokens.length,
        );

        await expect(
          vault.initialDeposit(
            [
              {
                token: tokenAddresses[0],
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
                token: tokenAddresses[tokens.length - 1],
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
    });

    it("should be possible to initialize the vault", async () => {
      await vault.initialDeposit(
        tokenValueArray(tokenAddresses, ONE, tokens.length),
        tokenWithValues(
          tokenAddresses,
          normalizeWeights(valueArray(ONE, tokens.length)),
        ),
      );

      expect(await vault.initialized()).to.equal(true);
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
        tokenValueArray(tokenAddresses, ONE, tokens.length),
        tokenWithValues(
          tokenAddresses,
          normalizeWeights(valueArray(ONE, tokens.length)),
        ),
      );
    });

    it("should be reverted to initialize the vault again", async () => {
      await expect(
        vault.initialDeposit(
          tokenValueArray(tokenAddresses, ONE, tokens.length),
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
        });

        describe("should be possible to deposit tokens", async () => {
          it("when vault value is less than minimum", async () => {
            await validator.setAllowances(valueArray(ONE, tokens.length));
            await vault.withdraw(
              tokenValueArray(tokenAddresses, toWei(0.3), tokens.length),
            );

            const spotPrices = await vault.getSpotPrices(sortedTokens[0]);
            for (let i = 1; i < poolTokens.length; i++) {
              await oracles[i].setLatestAnswer(spotPrices[i].div(1e10));
            }

            const amounts = tokens.map(_ =>
              toWei(Math.floor(10 + Math.random())),
            );

            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, amounts[i]);
            }

            const trx = await vault.deposit(
              tokenWithValues(tokenAddresses, amounts),
            );
            const weights = await vault.getNormalizedWeights();

            await expect(trx)
              .to.emit(vault, "Deposit")
              .withArgs(amounts, amounts, weights);
          });

          it("when deposit value is less than minimum", async () => {
            const spotPrices = await vault.getSpotPrices(sortedTokens[0]);
            for (let i = 1; i < poolTokens.length; i++) {
              await oracles[i].setLatestAnswer(spotPrices[i].div(1e10));
            }

            const amounts = valueArray(ONE, tokens.length);

            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, ONE);
            }

            const trx = await vault.deposit(
              tokenWithValues(tokenAddresses, amounts),
            );
            const weights = await vault.getNormalizedWeights();

            await expect(trx)
              .to.emit(vault, "Deposit")
              .withArgs(amounts, amounts, weights);
          });

          it("when vault value and deposit value are greater than minimum", async () => {
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

            const trx = await vault.deposit(
              tokenWithValues(tokenAddresses, amounts),
            );
            const weights = await vault.getNormalizedWeights();

            await expect(trx)
              .to.emit(vault, "Deposit")
              .withArgs(amounts, amounts, weights);
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
        });

        describe("should be possible to deposit tokens", async () => {
          it("when depositing one token", async () => {
            for (let i = 0; i < tokens.length; i++) {
              const amounts = new Array(tokens.length).fill(0);
              amounts[i] = toWei(5);

              const trx = await vault.depositRiskingArbitrage(
                tokenWithValues(tokenAddresses, amounts),
              );
              const weights = await vault.getNormalizedWeights();

              await expect(trx)
                .to.emit(vault, "Deposit")
                .withArgs(amounts, amounts, weights);
            }
          });

          it("when depositing tokens", async () => {
            const amounts = tokens.map(_ =>
              toWei(Math.floor(10 + Math.random() * 10)),
            );

            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, amounts[i]);
            }

            const trx = await vault.depositRiskingArbitrage(
              tokenWithValues(tokenAddresses, amounts),
            );
            const weights = await vault.getNormalizedWeights();

            await expect(trx)
              .to.emit(vault, "Deposit")
              .withArgs(amounts, amounts, weights);
          });

          it("when depositing tokens with depositRiskingArbitrageIfBalanceUnchanged", async () => {
            const amounts = tokens.map(_ =>
              toWei(Math.floor(10 + Math.random() * 10)),
            );

            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, amounts[i]);
            }

            const trx = await vault.depositRiskingArbitrageIfBalanceUnchanged(
              tokenWithValues(tokenAddresses, amounts),
            );
            const weights = await vault.getNormalizedWeights();

            await expect(trx)
              .to.emit(vault, "Deposit")
              .withArgs(amounts, amounts, weights);
          });
        });
      });
    });

    describe("when withdrawing from Vault", () => {
      describe("when allowance on validator is invalid", () => {
        it("should be reverted to withdraw tokens", async () => {
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
        });

        describe("should be possible to withdraw ", async () => {
          it("when withdrawing one token", async () => {
            await vault.depositRiskingArbitrage(
              tokenValueArray(tokenAddresses, toWei(5), tokens.length),
            );

            for (let i = 0; i < tokens.length; i++) {
              const amounts = new Array(tokens.length).fill(0);
              amounts[i] = toWei(5);

              const trx = await vault.withdraw(
                tokenWithValues(tokenAddresses, amounts),
              );

              const weights = await vault.getNormalizedWeights();
              await expect(trx)
                .to.emit(vault, "Withdraw")
                .withArgs(
                  amounts,
                  amounts,
                  valueArray(toWei(100000), tokens.length),
                  weights,
                );
            }
          });

          it("when withdrawing tokens", async () => {
            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, toWei(100000));
            }
            await vault.depositRiskingArbitrage(
              tokenValueArray(tokenAddresses, toWei(10000), tokens.length),
            );

            const amounts = tokens.map(_ =>
              toWei(Math.floor(10 + Math.random() * 10)),
            );

            const trx = await vault.withdraw(
              tokenWithValues(tokenAddresses, amounts),
            );

            const weights = await vault.getNormalizedWeights();
            await expect(trx)
              .to.emit(vault, "Withdraw")
              .withArgs(
                amounts,
                amounts,
                valueArray(toWei(100000), tokens.length),
                weights,
              );
          });

          it("when withdrawing tokens with withdrawIfBalanceUnchanged", async () => {
            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, toWei(100000));
            }
            await vault.depositRiskingArbitrage(
              tokenValueArray(tokenAddresses, toWei(10000), tokens.length),
            );

            const amounts = tokens.map(_ =>
              toWei(Math.floor(10 + Math.random() * 10)),
            );

            const trx = await vault.withdrawIfBalanceUnchanged(
              tokenWithValues(tokenAddresses, amounts),
            );
            const weights = await vault.getNormalizedWeights();
            await expect(trx)
              .to.emit(vault, "Withdraw")
              .withArgs(
                amounts,
                amounts,
                valueArray(toWei(100000), tokens.length),
                weights,
              );
          });
        });
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
      });

      it("should be possible to call updateWeightsGradually", async () => {
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

        await expect(
          vault
            .connect(manager)
            .updateWeightsGradually(
              tokenWithValues(tokenAddresses, normalizeWeights(endWeights)),
              startTime,
              endTime,
            ),
        )
          .to.emit(vault, "UpdateWeightsGradually")
          .withArgs(startTime, endTime, normalizeWeights(endWeights));
      });
    });

    describe("when call cancelWeightUpdates()", () => {
      it("should be reverted when called from non-manager", async () => {
        await expect(vault.cancelWeightUpdates()).to.be.revertedWith(
          "Aera__CallerIsNotManager",
        );
      });

      it("should be possible to call cancelWeightUpdates", async () => {
        const weights = await vault.getNormalizedWeights();

        await expect(vault.connect(manager).cancelWeightUpdates())
          .to.emit(vault, "CancelWeightUpdates")
          .withArgs(weights);
      });
    });

    describe.only("when call setTargetWeights", () => {
      describe("should be reverted to call setTargetWeights", async () => {
        it("when called from non-owner", async () => {
          await expect(
            vault
              .connect(user)
              .setTargetWeights(
                tokenWithValues(
                  tokenAddresses,
                  normalizeWeights(valueArray(ONE, tokens.length)),
                ),
                100,
              ),
          ).to.be.revertedWith("Aera__CallerIsNotManager");
        });

        it("when token and weight length is not same", async () => {
          await expect(
            vault
              .connect(manager)
              .setTargetWeights(
                tokenWithValues(
                  tokenAddresses,
                  normalizeWeights(valueArray(ONE, tokens.length - 1)),
                ),
                100,
              ),
          ).to.be.revertedWith("Aera__ValueLengthIsNotSame");
        });

        it("when token is not sorted", async () => {
          await expect(
            vault
              .connect(manager)
              .setTargetWeights(
                tokenWithValues(
                  unsortedTokens,
                  normalizeWeights(valueArray(ONE, tokens.length)),
                ),
                100,
              ),
          ).to.be.revertedWith("Aera__DifferentTokensInPosition");
        });

        it("when total sum of weights is not one", async () => {
          await expect(
            vault
              .connect(manager)
              .setTargetWeights(
                tokenValueArray(
                  tokenAddresses,
                  ONE.div(tokens.length).sub(1),
                  tokens.length,
                ),
                100,
              ),
          ).to.be.revertedWith("Aera__SumOfWeightIsNotOne");
        });
      });

      describe.only("should be possible to call setTargetWeights", async () => {
        describe("when underlying tokens are enough to mint yield tokens", async () => {
          it("update weights of only underlying tokens and yield tokens", async () => {
            const weights = await vault.getNormalizedWeights();
            const targetWeights = [...weights];
            for (let i = 0; i < yieldTokens.length; i++) {
              targetWeights[underlyingIndexes[i]] = targetWeights[
                underlyingIndexes[i]
              ].sub(toWei(0.01));
              targetWeights[i + poolTokens.length] = targetWeights[
                i + poolTokens.length
              ].add(toWei(0.01));
            }

            const trx = await vault
              .connect(manager)
              .setTargetWeights(
                tokenWithValues(tokenAddresses, targetWeights),
                100,
              );
            const currentTime = await getTimestamp(trx.blockNumber);

            await expect(trx)
              .to.emit(vault, "SetTargetWeights")
              .withArgs(currentTime, currentTime + 100, targetWeights);
          });

          it("update weights of all tokens", async () => {
            const weights = await vault.getNormalizedWeights();
            let targetWeights = [...weights];
            for (let i = 0; i < yieldTokens.length; i++) {
              targetWeights[underlyingIndexes[i]] = targetWeights[
                underlyingIndexes[i]
              ].sub(toWei(0.01));
              targetWeights[i + poolTokens.length] = targetWeights[
                i + poolTokens.length
              ].add(toWei(0.01));
            }

            let weightSum = ONE;
            let numAdjustedWeight = 0;
            for (let i = 0; i < tokens.length; i++) {
              if (i > poolTokens.length || underlyingIndexes.includes(i)) {
                weightSum = weightSum.sub(targetWeights[i]);
                numAdjustedWeight++;
              }
            }
            for (let i = 0; i < poolTokens.length; i++) {
              if (!underlyingIndexes.includes(i)) {
                targetWeights[i] = weightSum.div(numAdjustedWeight);
              }
            }

            targetWeights = normalizeWeights(targetWeights);

            const trx = await vault
              .connect(manager)
              .setTargetWeights(
                tokenWithValues(tokenAddresses, targetWeights),
                100,
              );

            const currentTime = await getTimestamp(trx.blockNumber);

            await expect(trx)
              .to.emit(vault, "SetTargetWeights")
              .withArgs(currentTime, currentTime + 100, targetWeights);
          });
        });

        it("when underlying tokens are not enough to mint yield tokens", async () => {
          const weights = await vault.getNormalizedWeights();
          let targetWeights = [...weights];
          for (let i = 0; i < yieldTokens.length; i++) {
            targetWeights[underlyingIndexes[i]] = toWei(0.1);
            targetWeights[i + poolTokens.length] = toWei(0.9);
          }
          for (let i = 0; i < poolTokens.length; i++) {
            if (!underlyingIndexes.includes(i)) {
              targetWeights[i] = toWei(0.1);
            }
          }

          targetWeights = normalizeWeights(targetWeights);

          const trx = await vault
            .connect(manager)
            .setTargetWeights(
              tokenWithValues(tokenAddresses, targetWeights),
              100,
            );
          const currentTime = await getTimestamp(trx.blockNumber);

          await expect(trx)
            .to.emit(vault, "SetTargetWeights")
            .withArgs(currentTime, currentTime + 100, targetWeights);
        });

        describe("when redeem yield tokens", async () => {
          it("update weights of only underlying tokens and yield tokens", async () => {
            const weights = await vault.getNormalizedWeights();
            const targetWeights = [...weights];
            for (let i = 0; i < yieldTokens.length; i++) {
              targetWeights[underlyingIndexes[i]] = targetWeights[
                underlyingIndexes[i]
              ].add(toWei(0.01));
              targetWeights[i + poolTokens.length] = targetWeights[
                i + poolTokens.length
              ].sub(toWei(0.01));
            }

            const trx = await vault
              .connect(manager)
              .setTargetWeights(
                tokenWithValues(tokenAddresses, targetWeights),
                100,
              );
            const currentTime = await getTimestamp(trx.blockNumber);

            await expect(trx)
              .to.emit(vault, "SetTargetWeights")
              .withArgs(currentTime, currentTime + 100, targetWeights);
          });

          it("update weights of all tokens", async () => {
            const weights = await vault.getNormalizedWeights();
            let targetWeights = [...weights];
            for (let i = 0; i < yieldTokens.length; i++) {
              targetWeights[underlyingIndexes[i]] = targetWeights[
                underlyingIndexes[i]
              ].add(toWei(0.01));
              targetWeights[i + poolTokens.length] = targetWeights[
                i + poolTokens.length
              ].sub(toWei(0.01));
            }

            let weightSum = ONE;
            let numAdjustedWeight = 0;
            for (let i = 0; i < tokens.length; i++) {
              if (i > poolTokens.length || underlyingIndexes.includes(i)) {
                weightSum = weightSum.sub(targetWeights[i]);
                numAdjustedWeight++;
              }
            }
            for (let i = 0; i < poolTokens.length; i++) {
              if (!underlyingIndexes.includes(i)) {
                targetWeights[i] = weightSum.div(numAdjustedWeight);
              }
            }

            targetWeights = normalizeWeights(targetWeights);

            const trx = await vault
              .connect(manager)
              .setTargetWeights(
                tokenWithValues(tokenAddresses, targetWeights),
                100,
              );
            const currentTime = await getTimestamp(trx.blockNumber);

            await expect(trx)
              .to.emit(vault, "SetTargetWeights")
              .withArgs(currentTime, currentTime + 100, targetWeights);
          });
        });
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
            vault.deposit(
              tokenValueArray(sortedTokens, ONE, poolTokens.length),
            ),
          ).to.be.revertedWith("Aera__VaultIsFinalized");
        });

        it("when call depositIfBalanceUnchanged", async () => {
          await expect(
            vault.depositIfBalanceUnchanged(
              tokenValueArray(sortedTokens, ONE, poolTokens.length),
            ),
          ).to.be.revertedWith("Aera__VaultIsFinalized");
        });

        it("when call depositRiskingArbitrage", async () => {
          await expect(
            vault.depositRiskingArbitrage(
              tokenValueArray(sortedTokens, ONE, poolTokens.length),
            ),
          ).to.be.revertedWith("Aera__VaultIsFinalized");
        });

        it("when call depositRiskingArbitrageIfBalanceUnchanged", async () => {
          await expect(
            vault.depositRiskingArbitrageIfBalanceUnchanged(
              tokenValueArray(sortedTokens, ONE, poolTokens.length),
            ),
          ).to.be.revertedWith("Aera__VaultIsFinalized");
        });

        it("when call withdraw", async () => {
          await expect(
            vault.withdraw(
              tokenValueArray(sortedTokens, ONE, poolTokens.length),
            ),
          ).to.be.revertedWith("Aera__VaultIsFinalized");
        });

        it("when call withdrawIfBalanceUnchanged", async () => {
          await expect(
            vault.withdrawIfBalanceUnchanged(
              tokenValueArray(sortedTokens, ONE, poolTokens.length),
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
          await expect(vault.claimManagerFees()).to.be.revertedWith(
            "Aera__VaultIsFinalized",
          );
        });
      });

      it("should be possible to finalize", async () => {
        const { holdings, balances } = await getState();

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

        await expect(trx)
          .to.emit(vault, "Finalized")
          .withArgs(admin.address, newHoldings);

        const newBalances = await getBalances();

        for (let i = 0; i < tokens.length; i++) {
          expect(newBalances[i]).to.equal(balances[i].add(newHoldings[i]));
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
          tokenValueArray(tokenAddresses, ONE, tokens.length),
          tokenWithValues(
            tokenAddresses,
            normalizeWeights(valueArray(ONE, tokens.length)),
          ),
        );
      });

      it("when disable trading, deposit and enable trading", async () => {
        const amounts = tokens.map(_ =>
          toWei(Math.floor(Math.random() * 100)),
        );

        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, amounts[i]);
        }

        const trx = vault.multicall([
          iface.encodeFunctionData("disableTrading", []),
          iface.encodeFunctionData("depositRiskingArbitrage", [
            tokenWithValues(tokenAddresses, amounts),
          ]),
          iface.encodeFunctionData("enableTradingRiskingArbitrage", []),
        ]);

        const weights = await vault.getNormalizedWeights();
        await expect(trx)
          .to.emit(vault, "SetSwapEnabled")
          .withArgs(false)
          .to.emit(vault, "Deposit")
          .withArgs(amounts, amounts, weights)
          .to.emit(vault, "SetSwapEnabled")
          .withArgs(true);
        expect(await vault.isSwapEnabled()).to.equal(true);
      });

      it("when set swap fees and update weights", async () => {
        const newFee = MIN_SWAP_FEE.add(1);
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

        const trx = vault
          .connect(manager)
          .multicall([
            iface.encodeFunctionData("setSwapFee", [newFee]),
            iface.encodeFunctionData("updateWeightsGradually", [
              tokenWithValues(tokenAddresses, normalizeWeights(endWeights)),
              startTime,
              endTime,
            ]),
          ]);

        await expect(trx)
          .to.emit(vault, "SetSwapFee")
          .withArgs(newFee)
          .to.emit(vault, "UpdateWeightsGradually")
          .withArgs(startTime, endTime, normalizeWeights(endWeights));
        expect(await vault.connect(manager).getSwapFee()).to.equal(newFee);
      });

      it("when disable trading, withdraw and enable trading", async () => {
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, toWei(100000));
        }
        await vault.depositRiskingArbitrage(
          tokenValueArray(tokenAddresses, toWei(10000), tokens.length),
        );
        await validator.setAllowances(
          valueArray(toWei(100000), tokens.length),
        );

        const amounts = tokens.map(_ =>
          toWei(Math.floor(Math.random() * 100)),
        );

        const trx = vault.multicall([
          iface.encodeFunctionData("disableTrading", []),
          iface.encodeFunctionData("withdraw", [
            tokenWithValues(tokenAddresses, amounts),
          ]),
          iface.encodeFunctionData("enableTradingRiskingArbitrage", []),
        ]);

        const weights = await vault.getNormalizedWeights();
        await expect(trx)
          .to.emit(vault, "SetSwapEnabled")
          .withArgs(false)
          .to.emit(vault, "Withdraw")
          .withArgs(
            amounts,
            amounts,
            valueArray(toWei(100000), tokens.length),
            weights,
          )
          .to.emit(vault, "SetSwapEnabled")
          .withArgs(true);
        expect(await vault.isSwapEnabled()).to.equal(true);
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
      await vault.initialDeposit(
        tokenValueArray(tokenAddresses, ONE, tokens.length),
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
        tokenValueArray(tokenAddresses, ONE, tokens.length),
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

        currentTime = await getTimestamp(trx.blockNumber);
        holdings.forEach((holding: BigNumber, index: number) => {
          managerFee[index] = managerFee[index].add(
            holding
              .mul(currentTime - lastFeeCheckpoint)
              .mul(MAX_MANAGEMENT_FEE)
              .div(ONE),
          );
        });

        await expect(trx)
          .to.emit(vault, "DistributeManagerFees")
          .withArgs(manager.address, managerFee);
      });

      it("when called from old manager", async () => {
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, toWei(100000));
        }

        let lastFeeCheckpoint = (await vault.lastFeeCheckpoint()).toNumber();
        let holdings = await vault.getHoldings();
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

        const trx = await vault.connect(manager).claimManagerFees();

        await expect(trx)
          .to.emit(vault, "DistributeManagerFees")
          .withArgs(manager.address, managerFee);
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
        await expect(vault.setManager(user.address))
          .to.emit(vault, "ManagerChanged")
          .withArgs(manager.address, user.address);

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
        await vault.initialDeposit(
          tokenValueArray(tokenAddresses, ONE, tokens.length),
          tokenWithValues(
            tokenAddresses,
            normalizeWeights(valueArray(ONE, tokens.length)),
          ),
        );
      });

      describe("with enableTradingRiskingArbitrage function", () => {
        it("should be reverted to enable trading", async () => {
          await expect(
            vault.connect(manager).enableTradingRiskingArbitrage(),
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("should be possible to enable trading", async () => {
          await expect(vault.enableTradingRiskingArbitrage())
            .to.emit(vault, "SetSwapEnabled")
            .withArgs(true);

          expect(await vault.isSwapEnabled()).to.equal(true);
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
                    sortedTokens,
                    ONE.div(poolTokens.length),
                    poolTokens.length,
                  ),
                ),
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("when token is not sorted", async () => {
            await vault.disableTrading();

            await expect(
              vault.enableTradingWithWeights(
                tokenWithValues(
                  unsortedTokens,
                  normalizeWeights(valueArray(ONE, tokens.length)),
                ),
              ),
            ).to.be.revertedWith("Aera__DifferentTokensInPosition");
          });

          it("when swap is already enabled", async () => {
            await expect(
              vault.enableTradingWithWeights(
                tokenValueArray(
                  sortedTokens,
                  ONE.div(poolTokens.length),
                  poolTokens.length,
                ),
              ),
            ).to.be.revertedWith("Aera__PoolSwapIsAlreadyEnabled");
          });
        });

        it("should be possible to enable trading", async () => {
          await vault.disableTrading();

          const trx = await vault.enableTradingWithWeights(
            tokenWithValues(
              tokenAddresses,
              normalizeWeights(valueArray(ONE, tokens.length)),
            ),
          );
          const currentTime = await getTimestamp(trx.blockNumber);

          await expect(trx)
            .to.emit(vault, "EnabledTradingWithWeights")
            .withArgs(
              currentTime,
              normalizeWeights(valueArray(ONE, tokens.length)),
            );

          expect(await vault.isSwapEnabled()).to.equal(true);
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
            .withArgs(true)
            .to.emit(vault, "UpdateWeightsWithOraclePrice");

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
        await vault.initialDeposit(
          tokenValueArray(tokenAddresses, ONE, tokens.length),
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

        await expect(vault.connect(manager).disableTrading())
          .to.emit(vault, "SetSwapEnabled")
          .withArgs(false);

        expect(await vault.isSwapEnabled()).to.equal(false);
      });
    });

    describe("Set Swap Fee", () => {
      describe("should be reverted", () => {
        it("when called from non-manager", async () => {
          await expect(vault.setSwapFee(toWei(3))).to.be.revertedWith(
            "Aera__CallerIsNotManager()",
          );
        });

        it("when called before cooldown", async () => {
          const newFee = MIN_SWAP_FEE.add(MAXIMUM_SWAP_FEE_PERCENT_CHANGE);
          await vault.connect(manager).setSwapFee(newFee);
          await expect(
            vault.connect(manager).setSwapFee(newFee.add(1)),
          ).to.be.revertedWith("Aera__CannotSetSwapFeeBeforeCooldown");
        });

        it("when positive change exceeds max", async () => {
          const invalidFee = MIN_SWAP_FEE.add(
            MAXIMUM_SWAP_FEE_PERCENT_CHANGE,
          ).add(1);
          await expect(
            vault.connect(manager).setSwapFee(invalidFee),
          ).to.be.revertedWith("Aera__SwapFeePercentageChangeIsAboveMax");
        });

        it("when negative change exceeds max", async () => {
          const newFee = MIN_SWAP_FEE.add(MAXIMUM_SWAP_FEE_PERCENT_CHANGE);
          await vault.connect(manager).setSwapFee(newFee);
          await increaseTime(SWAP_FEE_COOLDOWN_PERIOD);
          const invalidFee = newFee
            .sub(MAXIMUM_SWAP_FEE_PERCENT_CHANGE)
            .sub(1);
          await expect(
            vault.connect(manager).setSwapFee(invalidFee),
          ).to.be.revertedWith("Aera__SwapFeePercentageChangeIsAboveMax");
        });
      });

      it("should be possible to set swap fee", async () => {
        const newFee = MIN_SWAP_FEE.add(1);
        await expect(vault.connect(manager).setSwapFee(newFee))
          .to.emit(vault, "SetSwapFee")
          .withArgs(newFee);
        expect(await vault.connect(manager).getSwapFee()).to.equal(newFee);
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
          await expect(vault.transferOwnership(user.address)).to.emit(
            vault,
            "OwnershipTransferOffered",
          );
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
          await expect(vault.cancelOwnershipTransfer()).to.emit(
            vault,
            "OwnershipTransferCanceled",
          );
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
          await expect(vault.connect(user).acceptOwnership()).to.emit(
            vault,
            "OwnershipTransferred",
          );
          await vault.connect(user).transferOwnership(admin.address);
        });
      });
    });
  });
});
