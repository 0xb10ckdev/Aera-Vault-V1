import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { DEFAULT_NOTICE_PERIOD } from "../../../scripts/config";
import {
  AeraVaultV1Mock,
  AeraVaultV1Mock__factory,
  BalancerVaultMock__factory,
  BaseManagedPoolFactory__factory,
  IERC20,
  ManagedPoolFactory__factory,
  WithdrawalValidatorMock,
  WithdrawalValidatorMock__factory,
} from "../../../typechain";
import { baseContext } from "../../common/contexts";
import {
  MAXIMUM_SWAP_FEE_PERCENT_CHANGE,
  MAX_MANAGEMENT_FEE,
  MINIMUM_WEIGHT_CHANGE_DURATION,
  MIN_SWAP_FEE,
  MIN_WEIGHT,
  NOTICE_PERIOD,
  ONE,
  SWAP_FEE_COOLDOWN_PERIOD,
  ZERO_ADDRESS,
} from "../constants";
import { deployToken, setupTokens } from "../fixtures";
import {
  getCurrentTime,
  getTimestamp,
  increaseTime,
  tokenValueArray,
  tokenWithValues,
  toWei,
  valueArray,
} from "../utils";

baseContext("Aera Vault V1 Mainnet Functionality", function () {
  let admin: SignerWithAddress;
  let guardian: SignerWithAddress;
  let user: SignerWithAddress;
  let vault: AeraVaultV1Mock;
  let validator: WithdrawalValidatorMock;
  let tokens: IERC20[];
  let sortedTokens: string[];
  let unsortedTokens: string[];

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

  async function unitTestFixture() {
    const { tokens, sortedTokens, unsortedTokens } = await setupTokens();
    const validatorMock =
      await ethers.getContractFactory<WithdrawalValidatorMock__factory>(
        "WithdrawalValidatorMock",
      );
    const validator = await validatorMock.connect(admin).deploy(tokens.length);
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
    const factory = await managedPoolFactoryContract
      .connect(admin)
      .deploy(baseManagedPoolFactory.address);
    const validWeights = valueArray(ONE.div(tokens.length), tokens.length);

    const vaultFactory =
      await ethers.getContractFactory<AeraVaultV1Mock__factory>(
        "AeraVaultV1Mock",
      );
    const vault = await vaultFactory.connect(admin).deploy({
      factory: factory.address,
      name: "Test",
      symbol: "TEST",
      tokens: sortedTokens,
      weights: validWeights,
      swapFeePercentage: MIN_SWAP_FEE,
      guardian: guardian.address,
      validator: validator.address,
      noticePeriod: DEFAULT_NOTICE_PERIOD,
      managementFee: MAX_MANAGEMENT_FEE,
      merkleOrchard: ZERO_ADDRESS,
      description: "Test vault description",
    });

    return {
      vault,
      validator,
      tokens,
      sortedTokens,
      unsortedTokens,
    };
  }

  beforeEach(async function () {
    ({ admin, guardian, user } = this.signers);

    ({ vault, validator, tokens, sortedTokens, unsortedTokens } =
      await this.loadFixture(unitTestFixture));
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
            .connect(guardian)
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
          vault.connect(guardian).cancelWeightUpdates(),
        ).to.be.revertedWith("Aera__VaultNotInitialized");
      });

      it("when call claimGuardianFees", async () => {
        await expect(vault.claimGuardianFees()).to.be.revertedWith(
          "Aera__VaultNotInitialized",
        );
      });

      it("when call initiateFinalization", async () => {
        await expect(vault.initiateFinalization()).to.be.revertedWith(
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
            vault.deposit(tokenValueArray(unsortedTokens, ONE, tokens.length)),
          ).to.be.revertedWith("Aera__DifferentTokensInPosition");
        });

        it("when amount exceeds allowance", async () => {
          await expect(
            vault.deposit(
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

            const trx = await vault.deposit(
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
            toWei(Math.floor(50 + Math.random() * 10)),
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

        it("when depositing tokens with depositIfBalanceUnchanged", async () => {
          const amounts = tokens.map(_ =>
            toWei(Math.floor(50 + Math.random() * 10)),
          );

          for (let i = 0; i < tokens.length; i++) {
            await tokens[i].approve(vault.address, amounts[i]);
          }

          const trx = await vault.depositIfBalanceUnchanged(
            tokenWithValues(sortedTokens, amounts),
          );
          const weights = await vault.getNormalizedWeights();

          await expect(trx)
            .to.emit(vault, "Deposit")
            .withArgs(amounts, amounts, weights);
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
            await vault.deposit(
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
            await vault.deposit(
              tokenValueArray(sortedTokens, toWei(10000), tokens.length),
            );

            const amounts = tokens.map(_ =>
              toWei(Math.floor(50 + Math.random() * 10)),
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
            await vault.deposit(
              tokenValueArray(sortedTokens, toWei(10000), tokens.length),
            );

            const amounts = tokens.map(_ =>
              toWei(Math.floor(50 + Math.random() * 10)),
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
        it("when called from non-guardian", async () => {
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
          ).to.be.revertedWith("Aera__CallerIsNotGuardian");
        });

        it("when token is not sorted", async () => {
          const timestamp = await getCurrentTime();
          await expect(
            vault
              .connect(guardian)
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
              .connect(guardian)
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
              .connect(guardian)
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
              .connect(guardian)
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
              .connect(guardian)
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
              .connect(guardian)
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
            .connect(guardian)
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
      it("should be reverted when called from non-guardian", async () => {
        await expect(vault.cancelWeightUpdates()).to.be.revertedWith(
          "Aera__CallerIsNotGuardian",
        );
      });

      it("should be possible to call cancelWeightUpdates", async () => {
        const weights = await vault.getNormalizedWeights();

        await expect(vault.connect(guardian).cancelWeightUpdates())
          .to.emit(vault, "CancelWeightUpdates")
          .withArgs(weights);
      });
    });

    describe("when finalizing", () => {
      describe("should be reverted to call initiateFinalization", async () => {
        it("when called from non-owner", async () => {
          await expect(
            vault.connect(guardian).initiateFinalization(),
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });
      });

      describe("should be reverted to call finalize", async () => {
        it("when called from non-owner", async () => {
          await expect(vault.connect(user).finalize()).to.be.revertedWith(
            "Ownable: caller is not the owner",
          );
        });

        it("when finalization is not initiated", async () => {
          await expect(vault.finalize()).to.be.revertedWith(
            "Aera__FinalizationNotInitiated",
          );
        });

        it("when noticeTimeout is not elapsed", async () => {
          await vault.initiateFinalization();
          const noticeTimeoutAt = await vault.noticeTimeoutAt();

          await expect(vault.finalize()).to.be.revertedWith(
            `Aera__NoticeTimeoutNotElapsed(${noticeTimeoutAt})`,
          );
        });

        it("when already finalized", async () => {
          await vault.initiateFinalization();
          await ethers.provider.send("evm_increaseTime", [NOTICE_PERIOD + 1]);

          await vault.finalize();
          await expect(vault.finalize()).to.be.revertedWith(
            "Aera__VaultIsAlreadyFinalized",
          );
        });
      });

      describe("should be reverted to call functions when finalizing", async () => {
        beforeEach(async () => {
          await vault.initiateFinalization();
        });

        it("when call deposit", async () => {
          await expect(
            vault.deposit(tokenValueArray(sortedTokens, ONE, tokens.length)),
          ).to.be.revertedWith("Aera__VaultIsFinalizing");
        });

        it("when call withdraw", async () => {
          await expect(
            vault.withdraw(tokenValueArray(sortedTokens, ONE, tokens.length)),
          ).to.be.revertedWith("Aera__VaultIsFinalizing");
        });

        it("when call updateWeightsGradually", async () => {
          const blocknumber = await ethers.provider.getBlockNumber();
          await expect(
            vault
              .connect(guardian)
              .updateWeightsGradually(
                tokenValueArray(sortedTokens, MIN_WEIGHT, tokens.length),
                blocknumber + 1,
                blocknumber + 1000,
              ),
          ).to.be.revertedWith("Aera__VaultIsFinalizing");
        });

        it("when call cancelWeightUpdates", async () => {
          await expect(
            vault.connect(guardian).cancelWeightUpdates(),
          ).to.be.revertedWith("Aera__VaultIsFinalizing");
        });

        it("when call claimGuardianFees", async () => {
          await expect(vault.claimGuardianFees()).to.be.revertedWith(
            "Aera__VaultIsFinalizing",
          );
        });

        it("when call initiateFinalization", async () => {
          await expect(vault.initiateFinalization()).to.be.revertedWith(
            "Aera__VaultIsFinalizing",
          );
        });
      });

      it("should be possible to finalize", async () => {
        const trx = await vault.initiateFinalization();
        expect(await vault.isSwapEnabled()).to.equal(false);

        const noticeTimeoutAt = await vault.noticeTimeoutAt();
        await expect(trx)
          .to.emit(vault, "FinalizationInitiated")
          .withArgs(noticeTimeoutAt);

        await increaseTime(NOTICE_PERIOD + 1);

        const { holdings, balances } = await getState();

        await expect(vault.finalize())
          .to.emit(vault, "Finalized")
          .withArgs(admin.address, holdings);

        const newBalances = await getBalances();

        for (let i = 0; i < tokens.length; i++) {
          expect(newBalances[i]).to.equal(balances[i].add(holdings[i]));
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
          vault.connect(guardian).sweep(TOKEN.address, toWei(1001)),
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

  describe("Claim Guardian Fees", () => {
    beforeEach(async () => {
      for (let i = 0; i < tokens.length; i++) {
        await tokens[i].approve(vault.address, ONE);
      }
      await vault.initialDeposit(
        tokenValueArray(sortedTokens, ONE, tokens.length),
      );
    });

    it("should be reverted to claim guardian fees when no available fee", async () => {
      for (let i = 0; i < tokens.length; i++) {
        await tokens[i].approve(vault.address, toWei(100000));
      }
      await vault.deposit(
        tokenValueArray(sortedTokens, toWei(10000), tokens.length),
      );

      await expect(vault.claimGuardianFees()).to.be.revertedWith(
        "Aera__NoAvailableFeeForCaller",
      );
    });

    describe("should be possible to claim guardian fees", async () => {
      it("when called from current guardian", async () => {
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, toWei(100000));
        }

        let lastFeeCheckpoint = (await vault.lastFeeCheckpoint()).toNumber();
        let holdings = await vault.getHoldings();
        const depositTrx = await vault.deposit(
          tokenValueArray(sortedTokens, toWei(10000), tokens.length),
        );

        let currentTime = await getTimestamp(depositTrx.blockNumber);
        const guardianFee = holdings.map((holding: BigNumber) =>
          holding
            .mul(currentTime - lastFeeCheckpoint)
            .mul(MAX_MANAGEMENT_FEE)
            .div(ONE),
        );
        lastFeeCheckpoint = currentTime;

        holdings = await vault.getHoldings();
        const trx = await vault.connect(guardian).claimGuardianFees();

        currentTime = await getTimestamp(trx.blockNumber);
        holdings.forEach((holding: BigNumber, index: number) => {
          guardianFee[index] = guardianFee[index].add(
            holding
              .mul(currentTime - lastFeeCheckpoint)
              .mul(MAX_MANAGEMENT_FEE)
              .div(ONE),
          );
        });

        await expect(trx)
          .to.emit(vault, "DistributeGuardianFees")
          .withArgs(guardian.address, guardianFee);
      });

      it("when called from old guardian", async () => {
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, toWei(100000));
        }

        let lastFeeCheckpoint = (await vault.lastFeeCheckpoint()).toNumber();
        let holdings = await vault.getHoldings();
        const depositTrx = await vault.deposit(
          tokenValueArray(sortedTokens, toWei(10000), tokens.length),
        );

        let currentTime = await getTimestamp(depositTrx.blockNumber);
        const guardianFee = holdings.map((holding: BigNumber) =>
          holding
            .mul(currentTime - lastFeeCheckpoint)
            .mul(MAX_MANAGEMENT_FEE)
            .div(ONE),
        );
        lastFeeCheckpoint = currentTime;

        holdings = await vault.getHoldings();
        const setGuardianTrx = await vault.setGuardian(user.address);

        currentTime = await getTimestamp(setGuardianTrx.blockNumber);
        holdings.forEach((holding: BigNumber, index: number) => {
          guardianFee[index] = guardianFee[index].add(
            holding
              .mul(currentTime - lastFeeCheckpoint)
              .mul(MAX_MANAGEMENT_FEE)
              .div(ONE),
          );
        });

        const trx = await vault.connect(guardian).claimGuardianFees();

        await expect(trx)
          .to.emit(vault, "DistributeGuardianFees")
          .withArgs(guardian.address, guardianFee);
      });
    });
  });

  describe("Update Elements", () => {
    describe("Update Guardian", () => {
      describe("should be reverted to change guardian", async () => {
        it("when called from non-owner", async () => {
          await expect(
            vault.connect(guardian).setGuardian(ZERO_ADDRESS),
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("when parameter(new guardian) is zero address", async () => {
          await expect(vault.setGuardian(ZERO_ADDRESS)).to.be.revertedWith(
            "Aera__GuardianIsZeroAddress",
          );
        });

        it("when parameter(new guardian) is owner", async () => {
          await expect(vault.setGuardian(admin.address)).to.be.revertedWith(
            "Aera__GuardianIsOwner",
          );
        });
      });

      it("should be possible to change guardian", async () => {
        await expect(vault.setGuardian(user.address))
          .to.emit(vault, "GuardianChanged")
          .withArgs(guardian.address, user.address);

        expect(await vault.guardian()).to.equal(user.address);
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
            vault.connect(guardian).enableTradingRiskingArbitrage(),
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
                .connect(guardian)
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
          "Aera__CallerIsNotOwnerOrGuardian",
        );
      });

      it("should be possible to disable trading", async () => {
        expect(await vault.isSwapEnabled()).to.equal(true);

        await expect(vault.connect(guardian).disableTrading())
          .to.emit(vault, "SetSwapEnabled")
          .withArgs(false);

        expect(await vault.isSwapEnabled()).to.equal(false);
      });
    });

    describe("Set Swap Fee", () => {
      describe("should be reverted", () => {
        it("when called from non-guardian", async () => {
          await expect(vault.setSwapFee(toWei(3))).to.be.revertedWith(
            "Aera__CallerIsNotGuardian()",
          );
        });

        it("when called before cooldown", async () => {
          const newFee = MIN_SWAP_FEE.add(MAXIMUM_SWAP_FEE_PERCENT_CHANGE);
          await vault.connect(guardian).setSwapFee(newFee);
          await expect(
            vault.connect(guardian).setSwapFee(newFee.add(1)),
          ).to.be.revertedWith("Aera__CannotSetSwapFeeBeforeCooldown");
        });

        it("when positive change exceeds max", async () => {
          const invalidFee = MIN_SWAP_FEE.add(
            MAXIMUM_SWAP_FEE_PERCENT_CHANGE,
          ).add(1);
          await expect(
            vault.connect(guardian).setSwapFee(invalidFee),
          ).to.be.revertedWith("Aera__SwapFeePercentageChangeIsAboveMax");
        });

        it("when negative change exceeds max", async () => {
          const newFee = MIN_SWAP_FEE.add(MAXIMUM_SWAP_FEE_PERCENT_CHANGE);
          await vault.connect(guardian).setSwapFee(newFee);
          await increaseTime(SWAP_FEE_COOLDOWN_PERIOD);
          const invalidFee = newFee
            .sub(MAXIMUM_SWAP_FEE_PERCENT_CHANGE)
            .sub(1);
          await expect(
            vault.connect(guardian).setSwapFee(invalidFee),
          ).to.be.revertedWith("Aera__SwapFeePercentageChangeIsAboveMax");
        });
      });

      it("should be possible to set swap fee", async () => {
        const newFee = MIN_SWAP_FEE.add(1);
        await expect(vault.connect(guardian).setSwapFee(newFee))
          .to.emit(vault.connect(guardian), "SetSwapFee")
          .withArgs(newFee);
        expect(await vault.connect(guardian).getSwapFee()).to.equal(newFee);
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
