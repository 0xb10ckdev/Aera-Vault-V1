import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import {
  IERC20,
  AeraVaultV2Mock,
  WithdrawalValidatorMock,
  OracleMock,
} from "../../../typechain";
import {
  BALANCER_ERRORS,
  DEVIATION,
  MAXIMUM_SWAP_FEE_PERCENT_CHANGE,
  SWAP_FEE_COOLDOWN_PERIOD,
  MAX_MANAGEMENT_FEE,
  MAX_SWAP_FEE,
  MAX_WEIGHT_CHANGE_RATIO,
  MINIMUM_WEIGHT_CHANGE_DURATION,
  MIN_SWAP_FEE,
  MIN_WEIGHT,
  ONE,
  ZERO_ADDRESS,
  PRICE_DEVIATION,
  MIN_FEE_DURATION,
  MAX_ORACLE_SPOT_DIVERGENCE,
  MAX_ORACLE_DELAY,
} from "../constants";
import { deployToken } from "../fixtures";
import {
  getCurrentTime,
  getTimestamp,
  increaseTime,
  toWei,
  tokenValueArray,
  tokenWithValues,
  toUnit,
  valueArray,
} from "../utils";

export const test = (
  initalize: () => Promise<{
    admin: SignerWithAddress;
    manager: SignerWithAddress;
    user: SignerWithAddress;
    vault: AeraVaultV2Mock;
    validator: WithdrawalValidatorMock;
    tokens: IERC20[];
    sortedTokens: string[];
    oracles: OracleMock[];
    unsortedTokens: string[];
    snapshot: unknown;
  }>
): void => {
  let admin: SignerWithAddress;
  let manager: SignerWithAddress;
  let user: SignerWithAddress;
  let vault: AeraVaultV2Mock;
  let validator: WithdrawalValidatorMock;
  let tokens: IERC20[];
  let sortedTokens: string[];
  let oracles: OracleMock[];
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

  beforeEach(async () => {
    ({
      admin,
      manager,
      user,
      vault,
      validator,
      tokens,
      sortedTokens,
      oracles,
      unsortedTokens,
      snapshot
    } = await initalize());
  });

  afterEach(async function () {
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

      it("when amount is zero", async () => {
        const validAmounts = tokenValueArray(sortedTokens, ONE, tokens.length);

        await expect(
          vault.initialDeposit([
            {
              token: sortedTokens[0],
              value: 0,
            },
            ...validAmounts.slice(1),
          ]),
        ).to.be.revertedWith(BALANCER_ERRORS.ZERO_INVARIANT);

        await expect(
          vault.initialDeposit([
            ...validAmounts.slice(0, -1),
            {
              token: sortedTokens[tokens.length - 1],
              value: 0,
            },
          ]),
        ).to.be.revertedWith(BALANCER_ERRORS.ZERO_INVARIANT);
      });
    });

    it("should be possible to initialize the vault", async () => {
      const balances = await getUserBalances(admin.address);

      await vault.initialDeposit(
        tokenValueArray(sortedTokens, ONE, tokens.length),
      );

      const { holdings, adminBalances: newAdminBalances } = await getState();
      for (let i = 0; i < tokens.length; i++) {
        expect(newAdminBalances[i]).to.equal(balances[i].sub(ONE));
        expect(holdings[i]).to.equal(ONE);
      }
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

          it("when balance is changed in the same block", async () => {
            await validator.setAllowances(valueArray(toWei(1), tokens.length));
            await vault.withdraw(
              tokenValueArray(sortedTokens, toWei(0.9), tokens.length),
            );

            const spotPrices = await vault.getSpotPrices(tokens[0].address);
            for (let i = 1; i < tokens.length; i++) {
              await oracles[i].setLatestAnswer(spotPrices[i].div(1e10));
            }

            const amounts = tokens.map(_ =>
              toWei(Math.floor(1 + Math.random())),
            );

            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, amounts[i].mul(2));
            }

            await ethers.provider.send("evm_setAutomine", [false]);
            await ethers.provider.send("evm_setIntervalMining", [0]);

            const trx1 = await vault.deposit(
              tokenWithValues(sortedTokens, amounts),
            );
            const trx2 = await vault.depositIfBalanceUnchanged(
              tokenWithValues(sortedTokens, amounts),
            );

            await ethers.provider.send("evm_mine", []);

            try {
              await trx1.wait();
              await trx2.wait();
            } catch {
              // empty
            }

            const receipt1 = await ethers.provider.getTransactionReceipt(
              trx1.hash,
            );
            const receipt2 = await ethers.provider.getTransactionReceipt(
              trx2.hash,
            );

            expect(receipt1.status).to.equal(1);
            expect(receipt2.status).to.equal(0);

            await ethers.provider.send("evm_setAutomine", [true]);
            await ethers.provider.send("evm_setIntervalMining", [0]);
          });
        });

        describe("should be possible to deposit tokens", async () => {
          it("when vault value is less than minimum", async () => {
            await validator.setAllowances(valueArray(toWei(1), tokens.length));
            await vault.withdraw(
              tokenValueArray(sortedTokens, toWei(0.9), tokens.length),
            );

            const spotPrices = await vault.getSpotPrices(tokens[0].address);
            const oraclePrices: BigNumber[] = [ONE];
            for (let i = 1; i < tokens.length; i++) {
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

            const trx = await vault.deposit(tokenWithValues(sortedTokens, amounts));
            const weights = await vault.getNormalizedWeights();

            const newSpotPrices = await vault.getSpotPrices(tokens[0].address);

            for (let i = 1; i < tokens.length; i++) {
              expect(newSpotPrices[i]).to.be.closeTo(
                oraclePrices[i].mul(1e10),
                oraclePrices[i]
                  .mul(1e10)
                  .mul(PRICE_DEVIATION)
                  .div(ONE)
                  .toNumber(),
              );
            }

            await expect(trx)
              .to.emit(vault, "Deposit")
              .withArgs(amounts, amounts, weights);
          });

          it("when deposit value is less than minimum", async () => {
            const spotPrices = await vault.getSpotPrices(tokens[0].address);
            const oraclePrices: BigNumber[] = [ONE];
            for (let i = 1; i < tokens.length; i++) {
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

            const trx = await vault.deposit(tokenWithValues(sortedTokens, amounts));
            const weights = await vault.getNormalizedWeights();

            const newSpotPrices = await vault.getSpotPrices(tokens[0].address);

            for (let i = 1; i < tokens.length; i++) {
              expect(newSpotPrices[i]).to.be.closeTo(
                spotPrices[i],
                spotPrices[i].mul(PRICE_DEVIATION).div(ONE).toNumber(),
              );
            }

            await expect(trx)
              .to.emit(vault, "Deposit")
              .withArgs(amounts, amounts, weights);
          });

          it("when vault value and deposit value are greater than minimum", async () => {
            const spotPrices = await vault.getSpotPrices(tokens[0].address);
            const oraclePrices: BigNumber[] = [ONE];
            for (let i = 1; i < tokens.length; i++) {
              oraclePrices.push(
                spotPrices[i]
                  .mul(ONE)
                  .div(MAX_ORACLE_SPOT_DIVERGENCE.sub(toWei(0.05)))
                  .div(1e10),
              );
              await oracles[i].setLatestAnswer(oraclePrices[i]);
            }

            const amounts = tokens.map(_ =>
              toWei(Math.floor(10 + Math.random() * 10)),
            );

            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, amounts[i]);
            }

            const trx = await vault.deposit(tokenWithValues(sortedTokens, amounts));
            const weights = await vault.getNormalizedWeights();

            const newSpotPrices = await vault.getSpotPrices(tokens[0].address);

            for (let i = 1; i < tokens.length; i++) {
              expect(newSpotPrices[i]).to.be.closeTo(
                oraclePrices[i].mul(1e10),
                oraclePrices[i]
                  .mul(1e10)
                  .mul(PRICE_DEVIATION)
                  .div(ONE)
                  .toNumber(),
              );
            }

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

          it("when balance is changed in the same block", async () => {
            const amounts = tokens.map(_ =>
              toWei(Math.floor(10 + Math.random() * 10)),
            );

            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, amounts[i].mul(2));
            }

            await ethers.provider.send("evm_setAutomine", [false]);
            await ethers.provider.send("evm_setIntervalMining", [0]);

            const trx1 = await vault.depositRiskingArbitrage(
              tokenWithValues(sortedTokens, amounts),
            );
            const trx2 = await vault.depositRiskingArbitrageIfBalanceUnchanged(
              tokenWithValues(sortedTokens, amounts),
            );

            await ethers.provider.send("evm_mine", []);

            try {
              await trx1.wait();
              await trx2.wait();
            } catch {
              // empty
            }

            const receipt1 = await ethers.provider.getTransactionReceipt(
              trx1.hash,
            );
            const receipt2 = await ethers.provider.getTransactionReceipt(
              trx2.hash,
            );

            expect(receipt1.status).to.equal(1);
            expect(receipt2.status).to.equal(0);

            await ethers.provider.send("evm_setAutomine", [true]);
            await ethers.provider.send("evm_setIntervalMining", [0]);
          });
        });

        describe("should be possible to deposit tokens", async () => {
          it("when depositing one token", async () => {
            let { holdings, adminBalances } = await getState();
            let managersFeeTotal = await getManagersFeeTotal();

            for (let i = 0; i < tokens.length; i++) {
              const amounts = new Array(tokens.length).fill(0);
              amounts[i] = toWei(5);

              const spotPrices = await vault.getSpotPrices(tokens[i].address);

              const trx = await vault.depositRiskingArbitrage(
                tokenWithValues(sortedTokens, amounts),
              );
              const weights = await vault.getNormalizedWeights();
              const newManagersFeeTotal = await getManagersFeeTotal();

              const newSpotPrices = await vault.getSpotPrices(
                tokens[i].address,
              );
              const {
                holdings: newHoldings,
                adminBalances: newAdminBalances,
              } = await getState();

              for (let j = 0; j < tokens.length; j++) {
                expect(newSpotPrices[j]).to.closeTo(
                  spotPrices[j],
                  spotPrices[j].mul(PRICE_DEVIATION).div(ONE).toNumber(),
                );
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

              await expect(trx)
                .to.emit(vault, "Deposit")
                .withArgs(amounts, amounts, weights);

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
            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, amounts[i]);
              spotPrices.push(await vault.getSpotPrices(tokens[i].address));
            }

            const trx = await vault.depositRiskingArbitrage(
              tokenWithValues(sortedTokens, amounts),
            );
            const weights = await vault.getNormalizedWeights();
            const managersFeeTotal = await getManagersFeeTotal();

            const { holdings: newHoldings, adminBalances: newAdminBalances } =
              await getState();

            for (let i = 0; i < tokens.length; i++) {
              const newSpotPrices = await vault.getSpotPrices(
                tokens[i].address,
              );

              expect(
                await vault.getSpotPrice(
                  tokens[i].address,
                  tokens[(i + 1) % tokens.length].address,
                ),
              ).to.equal(newSpotPrices[(i + 1) % tokens.length]);

              for (let j = 0; j < tokens.length; j++) {
                expect(newSpotPrices[j]).to.be.closeTo(
                  spotPrices[i][j],
                  spotPrices[i][j].mul(PRICE_DEVIATION).div(ONE).toNumber(),
                );
              }

              expect(await vault.holding(i)).to.equal(newHoldings[i]);
              expect(newHoldings[i]).to.equal(
                holdings[i].add(amounts[i]).sub(managersFeeTotal[i]),
              );
              expect(newAdminBalances[i]).to.equal(
                adminBalances[i].sub(amounts[i]),
              );
            }

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

          it("when balance is changed in the same block", async () => {
            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, toWei(100000));
            }
            await vault.depositRiskingArbitrage(
              tokenValueArray(sortedTokens, toWei(10000), tokens.length),
            );

            const amounts = tokens.map(_ =>
              toWei(Math.floor(10 + Math.random() * 10)),
            );

            await ethers.provider.send("evm_setAutomine", [false]);
            await ethers.provider.send("evm_setIntervalMining", [0]);

            const trx1 = await vault.withdraw(
              tokenWithValues(sortedTokens, amounts),
            );
            const trx2 = await vault.withdrawIfBalanceUnchanged(
              tokenWithValues(sortedTokens, amounts),
            );

            await ethers.provider.send("evm_mine", []);

            try {
              await trx1.wait();
              await trx2.wait();
            } catch {
              // empty
            }

            const receipt1 = await ethers.provider.getTransactionReceipt(
              trx1.hash,
            );
            const receipt2 = await ethers.provider.getTransactionReceipt(
              trx2.hash,
            );

            expect(receipt1.status).to.equal(1);
            expect(receipt2.status).to.equal(0);

            await ethers.provider.send("evm_setAutomine", [true]);
            await ethers.provider.send("evm_setIntervalMining", [0]);
          });
        });

        describe("should be possible to withdraw ", async () => {
          it("when withdrawing one token", async () => {
            await vault.depositRiskingArbitrage(
              tokenValueArray(sortedTokens, toWei(5), tokens.length),
            );
            let { holdings, adminBalances } = await getState();
            let managersFeeTotal = await getManagersFeeTotal();

            for (let i = 0; i < tokens.length; i++) {
              const amounts = new Array(tokens.length).fill(0);
              amounts[i] = toWei(5);

              const spotPrices = await vault.getSpotPrices(tokens[i].address);

              await vault.withdraw(tokenWithValues(sortedTokens, amounts));
              const newManagersFeeTotal = await getManagersFeeTotal();

              const newSpotPrices = await vault.getSpotPrices(
                tokens[i].address,
              );
              const {
                holdings: newHoldings,
                adminBalances: newAdminBalances,
              } = await getState();

              for (let j = 0; j < tokens.length; j++) {
                expect(newSpotPrices[j]).to.closeTo(
                  spotPrices[j],
                  spotPrices[j].mul(PRICE_DEVIATION).div(ONE).toNumber(),
                );
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
              tokenValueArray(sortedTokens, toWei(10000), tokens.length),
            );

            const { holdings, adminBalances } = await getState();
            const managersFeeTotal = await getManagersFeeTotal();

            const amounts = tokens.map(_ =>
              toWei(Math.floor(10 + Math.random() * 10)),
            );

            const spotPrices = [];
            for (let i = 0; i < tokens.length; i++) {
              spotPrices.push(await vault.getSpotPrices(tokens[i].address));
            }

            await vault.withdraw(tokenWithValues(sortedTokens, amounts));
            const newManagersFeeTotal = await getManagersFeeTotal();

            const { holdings: newHoldings, adminBalances: newAdminBalances } =
              await getState();

            for (let i = 0; i < tokens.length; i++) {
              const newSpotPrices = await vault.getSpotPrices(
                tokens[i].address,
              );

              expect(
                await vault.getSpotPrice(
                  tokens[i].address,
                  tokens[(i + 1) % tokens.length].address,
                ),
              ).to.equal(newSpotPrices[(i + 1) % tokens.length]);

              for (let j = 0; j < tokens.length; j++) {
                expect(newSpotPrices[j]).to.be.closeTo(
                  spotPrices[i][j],
                  spotPrices[i][j].mul(PRICE_DEVIATION).div(ONE).toNumber(),
                );
              }

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

          const spotPrices = await vault.getSpotPrices(tokens[i].address);

          await vault.depositRiskingArbitrage(
            tokenWithValues(sortedTokens, amounts),
          );
          await vault.withdraw(tokenWithValues(sortedTokens, amounts));
          const newManagersFeeTotal = await getManagersFeeTotal();

          const newSpotPrices = await vault.getSpotPrices(tokens[i].address);
          const { holdings: newHoldings, adminBalances: newAdminBalances } =
            await getState();

          for (let j = 0; j < tokens.length; j++) {
            expect(newSpotPrices[j]).to.closeTo(
              spotPrices[j],
              spotPrices[j].mul(PRICE_DEVIATION).div(ONE).toNumber(),
            );
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
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, amounts[i]);
          spotPrices.push(await vault.getSpotPrices(tokens[i].address));
        }

        await vault.depositRiskingArbitrage(
          tokenWithValues(sortedTokens, amounts),
        );
        await vault.withdraw(tokenWithValues(sortedTokens, amounts));
        const managersFeeTotal = await getManagersFeeTotal();

        const { holdings: newHoldings, adminBalances: newAdminBalances } =
          await getState();

        for (let i = 0; i < tokens.length; i++) {
          const newSpotPrices = await vault.getSpotPrices(tokens[i].address);

          expect(
            await vault.getSpotPrice(
              tokens[i].address,
              tokens[(i + 1) % tokens.length].address,
            ),
          ).to.equal(newSpotPrices[(i + 1) % tokens.length]);

          for (let j = 0; j < tokens.length; j++) {
            expect(newSpotPrices[j]).to.be.closeTo(
              spotPrices[i][j],
              spotPrices[i][j].mul(PRICE_DEVIATION).div(ONE).toNumber(),
            );
          }

          expect(await vault.holding(i)).to.equal(newHoldings[i]);
          expect(newHoldings[i]).to.equal(
            holdings[i].sub(managersFeeTotal[i]),
          );
          expect(newAdminBalances[i]).to.equal(adminBalances[i]);
        }
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

        it("when total sum of weights is not one", async () => {
          const timestamp = await getCurrentTime();
          await expect(
            vault
              .connect(manager)
              .updateWeightsGradually(
                tokenValueArray(
                  sortedTokens,
                  ONE.div(tokens.length).sub(1),
                  tokens.length,
                ),
                timestamp,
                timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1,
              ),
          ).to.be.revertedWith(BALANCER_ERRORS.NORMALIZED_WEIGHT_INVARIANT);
        });

        it("when change ratio is greater than maximum", async () => {
          const timestamp = await getCurrentTime();
          const startWeights = await vault.getNormalizedWeights();
          const targetWeight0 = startWeights[0]
            .mul(ONE)
            .div(MAX_WEIGHT_CHANGE_RATIO + 2)
            .div(MINIMUM_WEIGHT_CHANGE_DURATION + 1);
          const targetWeights = [
            targetWeight0,
            ...valueArray(
              ONE.sub(targetWeight0).div(tokens.length - 1),
              tokens.length - 1,
            ),
          ];

          let weightSum = toWei(0);
          for (let i = 0; i < tokens.length; i++) {
            weightSum = weightSum.add(targetWeights[i]);
          }

          targetWeights[tokens.length - 1] = ONE.sub(weightSum).add(
            targetWeights[tokens.length - 1],
          );

          await expect(
            vault
              .connect(manager)
              .updateWeightsGradually(
                tokenWithValues(sortedTokens, targetWeights),
                timestamp,
                timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1,
              ),
          ).to.be.revertedWith("Aera__WeightChangeRatioIsAboveMax");
        });

        it("when weight is less than minimum", async () => {
          const timestamp = await getCurrentTime();
          const token0TargetWeight = toWei(0.009);
          const validDuration = ONE.mul(ONE)
            .div(tokens.length)
            .div(token0TargetWeight)
            .div(MAX_WEIGHT_CHANGE_RATIO)
            .add(1);
          await expect(
            vault.connect(manager).updateWeightsGradually(
              [
                {
                  token: sortedTokens[0],
                  value: token0TargetWeight,
                },
                ...tokenValueArray(
                  sortedTokens.slice(1),
                  ONE.sub(token0TargetWeight).div(tokens.length - 1),
                  tokens.length - 1,
                ),
              ],
              timestamp,
              timestamp + validDuration.toNumber() + 1,
            ),
          ).to.be.revertedWith(BALANCER_ERRORS.MIN_WEIGHT);
        });
      });

      it("should be possible to call updateWeightsGradually", async () => {
        const startWeights = await vault.getNormalizedWeights();
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
            tokenWithValues(sortedTokens, endWeights),
            startTime,
            endTime,
          );

        await increaseTime(MINIMUM_WEIGHT_CHANGE_DURATION);

        const currentWeights = await vault.getNormalizedWeights();

        const currentTime = await getCurrentTime();
        const ptcProgress = ONE.mul(currentTime - startTime).div(
          endTime - startTime,
        );

        for (let i = 0; i < tokens.length; i++) {
          const weightDelta = endWeights[i]
            .sub(startWeights[i])
            .mul(ptcProgress)
            .div(ONE);
          expect(startWeights[i].add(weightDelta)).to.be.closeTo(
            currentWeights[i],
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
              tokenWithValues(sortedTokens, endWeights),
              startTime,
              endTime,
            );

          await vault.depositRiskingArbitrage(
            tokenValueArray(sortedTokens, toWei(50), tokens.length),
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
            tokenValueArray(sortedTokens, toWei(50), tokens.length),
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
              tokenWithValues(sortedTokens, endWeights),
              startTime,
              endTime,
            );

          await vault.withdraw(
            tokenValueArray(sortedTokens, toWei(50), tokens.length),
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

    describe("when calling cancelWeightUpdates()", () => {
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
            tokenWithValues(sortedTokens, endWeights),
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
            holding.mul(ONE.sub(MAX_MANAGEMENT_FEE.mul(feeIndex))).div(ONE),
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
          await tokens[i].approve(vault.address, ONE);
        }
        await vault.initialDeposit(
          tokenValueArray(sortedTokens, ONE, tokens.length),
        );
      });

      it("when disable trading, deposit and enable trading", async () => {
        const { holdings, adminBalances } = await getState();

        const amounts = tokens.map(_ =>
          toWei(Math.floor(Math.random() * 100)),
        );

        const spotPrices = [];
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, amounts[i]);
          spotPrices.push(await vault.getSpotPrices(tokens[i].address));
        }

        await vault.multicall([
          iface.encodeFunctionData("disableTrading", []),
          iface.encodeFunctionData("depositRiskingArbitrage", [
            tokenWithValues(sortedTokens, amounts),
          ]),
          iface.encodeFunctionData("enableTradingRiskingArbitrage", []),
        ]);

        expect(await vault.isSwapEnabled()).to.equal(true);
        const managersFeeTotal = await getManagersFeeTotal();

        const { holdings: newHoldings, adminBalances: newAdminBalances } =
          await getState();

        for (let i = 0; i < tokens.length; i++) {
          const newSpotPrices = await vault.getSpotPrices(tokens[i].address);

          expect(
            await vault.getSpotPrice(
              tokens[i].address,
              tokens[(i + 1) % tokens.length].address,
            ),
          ).to.equal(newSpotPrices[(i + 1) % tokens.length]);

          for (let j = 0; j < tokens.length; j++) {
            expect(newSpotPrices[j]).to.be.closeTo(
              spotPrices[i][j],
              DEVIATION,
            );
          }

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
          .multicall([
            iface.encodeFunctionData("setSwapFee", [newFee]),
            iface.encodeFunctionData("updateWeightsGradually", [
              tokenWithValues(sortedTokens, endWeights),
              startTime,
              endTime,
            ]),
          ]);

        expect(await vault.connect(manager).getSwapFee()).to.equal(newFee);
        await increaseTime(MINIMUM_WEIGHT_CHANGE_DURATION);

        const currentWeights = await vault.getNormalizedWeights();

        const currentTime = await getCurrentTime();
        const ptcProgress = ONE.mul(currentTime - startTime).div(
          endTime - startTime,
        );

        for (let i = 0; i < tokens.length; i++) {
          const weightDelta = endWeights[i]
            .sub(startWeights[i])
            .mul(ptcProgress)
            .div(ONE);
          expect(startWeights[i].add(weightDelta)).to.be.closeTo(
            currentWeights[i],
            DEVIATION,
          );
        }
      });

      it("when disable trading, withdraw and enable trading", async () => {
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, toWei(100000));
        }
        await vault.depositRiskingArbitrage(
          tokenValueArray(sortedTokens, toWei(10000), tokens.length),
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
        for (let i = 0; i < tokens.length; i++) {
          spotPrices.push(await vault.getSpotPrices(tokens[i].address));
        }

        await vault.multicall([
          iface.encodeFunctionData("disableTrading", []),
          iface.encodeFunctionData("withdraw", [
            tokenWithValues(sortedTokens, amounts),
          ]),
          iface.encodeFunctionData("enableTradingRiskingArbitrage", []),
        ]);

        expect(await vault.isSwapEnabled()).to.equal(true);
        const newManagersFeeTotal = await getManagersFeeTotal();

        const { holdings: newHoldings, adminBalances: newAdminBalances } =
          await getState();

        for (let i = 0; i < tokens.length; i++) {
          const newSpotPrices = await vault.getSpotPrices(tokens[i].address);

          expect(
            await vault.getSpotPrice(
              tokens[i].address,
              tokens[(i + 1) % tokens.length].address,
            ),
          ).to.equal(newSpotPrices[(i + 1) % tokens.length]);

          for (let j = 0; j < tokens.length; j++) {
            expect(newSpotPrices[j]).to.be.closeTo(
              spotPrices[i][j],
              DEVIATION,
            );
          }

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
        const managerBalances = await getUserBalances(manager.address);
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
        await vault.initialDeposit(
          tokenValueArray(sortedTokens, ONE, tokens.length),
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

          it("when total sum of weights is not one", async () => {
            await vault.disableTrading();

            await expect(
              vault.enableTradingWithWeights(
                tokenValueArray(
                  sortedTokens,
                  ONE.div(tokens.length).sub(1),
                  tokens.length,
                ),
              ),
            ).to.be.revertedWith(BALANCER_ERRORS.NORMALIZED_WEIGHT_INVARIANT);
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

          const newWeights = [];
          const avgWeights = ONE.div(tokens.length);
          for (let i = 0; i < tokens.length; i += 2) {
            if (i < tokens.length - 1) {
              newWeights.push(avgWeights.add(toWei((i + 1) / 100)));
              newWeights.push(avgWeights.sub(toWei((i + 1) / 100)));
            } else {
              newWeights.push(avgWeights);
            }
          }

          await vault.enableTradingWithWeights(
            tokenWithValues(sortedTokens, newWeights),
          );

          const currentWeights = await vault.getNormalizedWeights();

          expect(await vault.isSwapEnabled()).to.equal(true);
          for (let i = 0; i < tokens.length; i++) {
            expect(newWeights[i]).to.be.closeTo(currentWeights[i], DEVIATION);
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
          for (let i = 1; i < tokens.length; i++) {
            oraclePrices.push(
              toUnit(Math.floor((0.1 + Math.random()) * 50), 8),
            );
            await oracles[i].setLatestAnswer(oraclePrices[i]);
          }

          await expect(vault.connect(manager).enableTradingWithOraclePrice())
            .to.emit(vault, "SetSwapEnabled")
            .withArgs(true);

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
};
