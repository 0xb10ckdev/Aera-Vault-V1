import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import {
  BalancerVaultMock__factory,
  IERC20,
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
import { deployToken, setupTokens, setupOracles } from "../fixtures";
import {
  getCurrentTime,
  getTimestamp,
  increaseTime,
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
  let tokens: IERC20[];
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
    ({ tokens, sortedTokens, unsortedTokens } = await setupTokens());
    oracles = await setupOracles();
    oracleAddresses = oracles.map((oracle: OracleMock) => oracle.address);
    oracleAddresses[0] = ZERO_ADDRESS;

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

    const validWeights = valueArray(ONE.div(tokens.length), tokens.length);

    const vaultFactory =
      await ethers.getContractFactory<AeraVaultV2Mock__factory>(
        "AeraVaultV2Mock",
      );
    vault = await vaultFactory.connect(admin).deploy({
      factory: factory.address,
      name: "Test",
      symbol: "TEST",
      tokens: sortedTokens,
      weights: validWeights,
      oracles: oracleAddresses,
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
          vault.deposit(tokenValueArray(sortedTokens, ONE, tokens.length)),
        ).to.be.revertedWith("Aera__VaultNotInitialized");
      });

      it("when call depositIfBalanceUnchanged", async () => {
        await expect(
          vault.depositIfBalanceUnchanged(
            tokenValueArray(sortedTokens, ONE, tokens.length),
          ),
        ).to.be.revertedWith("Aera__VaultNotInitialized");
      });

      it("when call depositRiskingArbitrage", async () => {
        await expect(
          vault.depositRiskingArbitrage(
            tokenValueArray(sortedTokens, ONE, tokens.length),
          ),
        ).to.be.revertedWith("Aera__VaultNotInitialized");
      });

      it("when call depositRiskingArbitrageIfBalanceUnchanged", async () => {
        await expect(
          vault.depositRiskingArbitrageIfBalanceUnchanged(
            tokenValueArray(sortedTokens, ONE, tokens.length),
          ),
        ).to.be.revertedWith("Aera__VaultNotInitialized");
      });

      it("when call withdraw", async () => {
        await expect(
          vault.withdraw(tokenValueArray(sortedTokens, ONE, tokens.length)),
        ).to.be.revertedWith("Aera__VaultNotInitialized");
      });

      it("when call withdrawIfBalanceUnchanged", async () => {
        await expect(
          vault.withdrawIfBalanceUnchanged(
            tokenValueArray(sortedTokens, ONE, tokens.length),
          ),
        ).to.be.revertedWith("Aera__VaultNotInitialized");
      });

      it("when call updateWeightsGradually", async () => {
        const blocknumber = await ethers.provider.getBlockNumber();
        await expect(
          vault
            .connect(manager)
            .updateWeightsGradually(
              tokenValueArray(
                sortedTokens,
                ONE.div(tokens.length),
                tokens.length,
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
            tokenValueArray(sortedTokens, ONE, tokens.length + 1),
          ),
        ).to.be.revertedWith("Aera__ValueLengthIsNotSame");
      });

      it("when token is not sorted", async () => {
        await expect(
          vault.initialDeposit(
            tokenValueArray(unsortedTokens, ONE, tokens.length),
          ),
        ).to.be.revertedWith("Aera__DifferentTokensInPosition");
      });

      it("when amount exceeds allowance", async () => {
        const validAmounts = tokenValueArray(sortedTokens, ONE, tokens.length);

        await expect(
          vault.initialDeposit([
            {
              token: sortedTokens[0],
              value: toWei(3),
            },
            ...validAmounts.slice(1),
          ]),
        ).to.be.revertedWith("ERC20: insufficient allowance");

        await expect(
          vault.initialDeposit([
            ...validAmounts.slice(0, -1),
            {
              token: sortedTokens[tokens.length - 1],
              value: toWei(3),
            },
          ]),
        ).to.be.revertedWith("ERC20: insufficient allowance");
      });
    });

    it("should be possible to initialize the vault", async () => {
      await vault.initialDeposit(
        tokenValueArray(sortedTokens, ONE, tokens.length),
      );

      expect(await vault.initialized()).to.equal(true);
    });
  });

  describe("when Vault is initialized", () => {
    beforeEach(async () => {
      for (let i = 0; i < tokens.length; i++) {
        await tokens[i].approve(vault.address, toWei(100));
      }
      await vault.initialDeposit(
        tokenValueArray(sortedTokens, ONE, tokens.length),
      );
    });

    it("should be reverted to initialize the vault again", async () => {
      await expect(
        vault.initialDeposit(
          tokenValueArray(sortedTokens, ONE, tokens.length),
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
                .deposit(tokenValueArray(sortedTokens, ONE, tokens.length)),
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("when token and amount length is not same", async () => {
            await expect(
              vault.deposit(
                tokenValueArray(sortedTokens, ONE, tokens.length + 1),
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
            const spotPrices = await vault.getSpotPrices(tokens[0].address);
            for (let i = 1; i < tokens.length; i++) {
              await oracles[i].setLatestAnswer(spotPrices[i].div(1e10));
            }
            await expect(
              vault.deposit(
                tokenValueArray(sortedTokens, toWei(100), tokens.length),
              ),
            ).to.be.revertedWith("ERC20: insufficient allowance");
          });

          it("when oracle is disabled", async () => {
            const spotPrices = await vault.getSpotPrices(tokens[0].address);
            for (let i = 1; i < tokens.length; i++) {
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
              vault.deposit(tokenWithValues(sortedTokens, amounts)),
            ).to.be.revertedWith("Aera__OraclesAreDisabled");
          });

          it("when oracle is delayed beyond maximum", async () => {
            const timestamp = await getCurrentTime();
            const spotPrices = await vault.getSpotPrices(tokens[0].address);
            for (let i = 1; i < tokens.length; i++) {
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
              vault.deposit(tokenWithValues(sortedTokens, amounts)),
            ).to.be.revertedWith("Aera__OracleIsDelayedBeyondMax");
          });

          it("when oracle and spot price divergence exceeds maximum", async () => {
            const spotPrices = await vault.getSpotPrices(tokens[0].address);
            for (let i = 1; i < tokens.length; i++) {
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
              vault.deposit(tokenWithValues(sortedTokens, amounts)),
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
              vault.deposit(tokenWithValues(sortedTokens, amounts)),
            ).to.be.revertedWith("Aera__OraclePriceIsInvalid");
          });
        });

        describe("should be possible to deposit tokens", async () => {
          it("when vault value is less than minimum", async () => {
            await validator.setAllowances(valueArray(ONE, tokens.length));
            await vault.withdraw(
              tokenValueArray(sortedTokens, toWei(0.9), tokens.length),
            );

            const spotPrices = await vault.getSpotPrices(tokens[0].address);
            for (let i = 1; i < tokens.length; i++) {
              await oracles[i].setLatestAnswer(spotPrices[i].div(1e10));
            }

            const amounts = tokens.map(_ =>
              toWei(Math.floor(10 + Math.random())),
            );

            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, amounts[i]);
            }

            const trx = await vault.deposit(
              tokenWithValues(sortedTokens, amounts),
            );
            const weights = await vault.getNormalizedWeights();

            await expect(trx)
              .to.emit(vault, "Deposit")
              .withArgs(amounts, amounts, weights);
          });

          it("when deposit value is less than minimum", async () => {
            const spotPrices = await vault.getSpotPrices(tokens[0].address);
            for (let i = 1; i < tokens.length; i++) {
              await oracles[i].setLatestAnswer(spotPrices[i].div(1e10));
            }

            const amounts = tokens.map(_ =>
              toWei(Math.floor(1 + Math.random())),
            );

            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, amounts[i]);
            }

            const trx = await vault.deposit(
              tokenWithValues(sortedTokens, amounts),
            );
            const weights = await vault.getNormalizedWeights();

            await expect(trx)
              .to.emit(vault, "Deposit")
              .withArgs(amounts, amounts, weights);
          });

          it("when vault value and deposit value are greater than minimum", async () => {
            const spotPrices = await vault.getSpotPrices(tokens[0].address);
            for (let i = 1; i < tokens.length; i++) {
              await oracles[i].setLatestAnswer(spotPrices[i].div(1e10));
            }

            const amounts = tokens.map(_ =>
              toWei(Math.floor(10 + Math.random() * 10)),
            );

            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, amounts[i]);
            }

            const trx = await vault.deposit(
              tokenWithValues(sortedTokens, amounts),
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
                  tokenValueArray(sortedTokens, ONE, tokens.length),
                ),
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("when token and amount length is not same", async () => {
            await expect(
              vault.depositRiskingArbitrage(
                tokenValueArray(sortedTokens, ONE, tokens.length + 1),
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
                tokenValueArray(sortedTokens, toWei(100), tokens.length),
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
                tokenWithValues(sortedTokens, amounts),
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
              tokenWithValues(sortedTokens, amounts),
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
              tokenWithValues(sortedTokens, amounts),
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
        it("should revert to withdraw tokens", async () => {
          await expect(
            vault.withdraw(
              tokenValueArray(sortedTokens, toWei(5), tokens.length),
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
                .withdraw(tokenValueArray(sortedTokens, ONE, tokens.length)),
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("when token and amount length is not same", async () => {
            await expect(
              vault.withdraw(
                tokenValueArray(sortedTokens, ONE, tokens.length + 1),
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
                  token: sortedTokens[0],
                  value: holdings[0].add(1),
                },
                ...tokenValueArray(
                  sortedTokens.slice(1),
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
              tokenValueArray(sortedTokens, toWei(5), tokens.length),
            );

            for (let i = 0; i < tokens.length; i++) {
              const amounts = new Array(tokens.length).fill(0);
              amounts[i] = toWei(5);

              const trx = await vault.withdraw(
                tokenWithValues(sortedTokens, amounts),
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
              tokenValueArray(sortedTokens, toWei(10000), tokens.length),
            );

            const amounts = tokens.map(_ =>
              toWei(Math.floor(10 + Math.random() * 10)),
            );

            const trx = await vault.withdraw(
              tokenWithValues(sortedTokens, amounts),
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
              tokenValueArray(sortedTokens, toWei(10000), tokens.length),
            );

            const amounts = tokens.map(_ =>
              toWei(Math.floor(10 + Math.random() * 10)),
            );

            const trx = await vault.withdrawIfBalanceUnchanged(
              tokenWithValues(sortedTokens, amounts),
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

    describe("when calling updateWeightsGradually()", () => {
      describe("should be reverted to call updateWeightsGradually", async () => {
        it("when called from non-manager", async () => {
          await expect(
            vault.updateWeightsGradually(
              tokenValueArray(
                sortedTokens,
                ONE.div(tokens.length),
                tokens.length,
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
                tokenValueArray(
                  unsortedTokens,
                  ONE.div(tokens.length),
                  tokens.length,
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
                tokenValueArray(
                  sortedTokens,
                  ONE.div(tokens.length),
                  tokens.length,
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
                tokenValueArray(
                  sortedTokens,
                  ONE.div(tokens.length),
                  tokens.length,
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
                tokenValueArray(
                  sortedTokens,
                  ONE.div(tokens.length),
                  tokens.length,
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
                tokenValueArray(
                  sortedTokens,
                  ONE.div(tokens.length),
                  tokens.length,
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
                tokenValueArray(
                  sortedTokens,
                  ONE.div(tokens.length),
                  tokens.length,
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
              tokenWithValues(sortedTokens, endWeights),
              startTime,
              endTime,
            ),
        )
          .to.emit(vault, "UpdateWeightsGradually")
          .withArgs(startTime, endTime, endWeights);
      });
    });

    describe("when calling cancelWeightUpdates()", () => {
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

    describe("when finalizing", () => {
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
            vault.deposit(tokenValueArray(sortedTokens, ONE, tokens.length)),
          ).to.be.revertedWith("Aera__VaultIsFinalized");
        });

        it("when call depositIfBalanceUnchanged", async () => {
          await expect(
            vault.depositIfBalanceUnchanged(
              tokenValueArray(sortedTokens, ONE, tokens.length),
            ),
          ).to.be.revertedWith("Aera__VaultIsFinalized");
        });

        it("when call depositRiskingArbitrage", async () => {
          await expect(
            vault.depositRiskingArbitrage(
              tokenValueArray(sortedTokens, ONE, tokens.length),
            ),
          ).to.be.revertedWith("Aera__VaultIsFinalized");
        });

        it("when call depositRiskingArbitrageIfBalanceUnchanged", async () => {
          await expect(
            vault.depositRiskingArbitrageIfBalanceUnchanged(
              tokenValueArray(sortedTokens, ONE, tokens.length),
            ),
          ).to.be.revertedWith("Aera__VaultIsFinalized");
        });

        it("when call withdraw", async () => {
          await expect(
            vault.withdraw(tokenValueArray(sortedTokens, ONE, tokens.length)),
          ).to.be.revertedWith("Aera__VaultIsFinalized");
        });

        it("when call withdrawIfBalanceUnchanged", async () => {
          await expect(
            vault.withdrawIfBalanceUnchanged(
              tokenValueArray(sortedTokens, ONE, tokens.length),
            ),
          ).to.be.revertedWith("Aera__VaultIsFinalized");
        });

        it("when call updateWeightsGradually", async () => {
          const blocknumber = await ethers.provider.getBlockNumber();
          await expect(
            vault
              .connect(manager)
              .updateWeightsGradually(
                tokenValueArray(sortedTokens, MIN_WEIGHT, tokens.length),
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
            holding.mul(ONE.sub(MAX_MANAGEMENT_FEE.mul(feeIndex))).div(ONE),
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

  describe("Get Spot Prices", () => {
    let TOKEN: IERC20;
    beforeEach(async () => {
      ({ TOKEN } = await deployToken());
      for (let i = 0; i < tokens.length; i++) {
        await tokens[i].approve(vault.address, ONE);
      }
      await vault.initialDeposit(
        tokenValueArray(sortedTokens, ONE, tokens.length),
      );
    });

    it("should return zero for invalid token", async () => {
      const spotPrices = await vault.getSpotPrices(TOKEN.address);

      for (let i = 0; i < tokens.length; i++) {
        expect(spotPrices[i]).to.equal(toWei(0));
        expect(
          await vault.getSpotPrice(TOKEN.address, tokens[i].address),
        ).to.equal(toWei(0));
        expect(
          await vault.getSpotPrice(tokens[i].address, TOKEN.address),
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
        await expect(vault.sweep(poolToken, toWei(1))).to.be.revertedWith(
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
      await vault.initialDeposit(
        tokenValueArray(sortedTokens, ONE, tokens.length),
      );
    });

    it("should be reverted to claim manager fees when no available fee", async () => {
      for (let i = 0; i < tokens.length; i++) {
        await tokens[i].approve(vault.address, toWei(100000));
      }
      await vault.depositRiskingArbitrage(
        tokenValueArray(sortedTokens, toWei(10000), tokens.length),
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
          tokenValueArray(sortedTokens, toWei(10000), tokens.length),
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
          tokenValueArray(sortedTokens, toWei(10000), tokens.length),
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
          tokenValueArray(sortedTokens, ONE, tokens.length),
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

          it("when swap is already enabled", async () => {
            await expect(
              vault.enableTradingWithWeights(
                tokenValueArray(
                  sortedTokens,
                  ONE.div(tokens.length),
                  tokens.length,
                ),
              ),
            ).to.be.revertedWith("Aera__PoolSwapIsAlreadyEnabled");
          });
        });

        it("should be possible to enable trading", async () => {
          await vault.disableTrading();

          const trx = await vault.enableTradingWithWeights(
            tokenValueArray(
              sortedTokens,
              ONE.div(tokens.length),
              tokens.length,
            ),
          );
          const currentTime = await getTimestamp(trx.blockNumber);

          await expect(trx)
            .to.emit(vault, "EnabledTradingWithWeights")
            .withArgs(
              currentTime,
              valueArray(ONE.div(tokens.length), tokens.length),
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
          for (let i = 1; i < tokens.length; i++) {
            oraclePrices.push(
              toUnit(Math.floor((0.1 + Math.random()) * 50), 8),
            );
            await oracles[i].setLatestAnswer(oraclePrices[i]);
          }

          await expect(vault.connect(manager).enableTradingWithOraclePrice())
            .to.emit(vault, "SetSwapEnabled")
            .withArgs(true)
            .to.emit(vault, "UpdateWeightsWithOraclePrice");

          for (let i = 0; i < tokens.length; i++) {
            expect(
              await vault.getSpotPrice(tokens[i].address, tokens[0].address),
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
          tokenValueArray(sortedTokens, ONE, tokens.length),
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
          .to.emit(vault.connect(manager), "SetSwapFee")
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
