import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { DEFAULT_NOTICE_PERIOD } from "../../scripts/config";
import {
  BalancerVaultMock__factory,
  IERC20,
  BaseManagedPoolFactory,
  BaseManagedPoolFactory__factory,
  MammonVaultV1Mock,
  MammonVaultV1Mock__factory,
  WithdrawalValidatorMock,
  WithdrawalValidatorMock__factory,
} from "../../typechain";
import {
  MINIMUM_WEIGHT_CHANGE_DURATION,
  MIN_SWAP_FEE,
  MIN_WEIGHT,
  NOTICE_PERIOD,
  ONE,
  ZERO_ADDRESS,
} from "../constants";
import { deployToken, setupTokens } from "../fixtures";
import { getCurrentTime, toWei, valueArray } from "../utils";

describe("Mammon Vault V1 Mainnet Functionality", function () {
  let admin: SignerWithAddress;
  let manager: SignerWithAddress;
  let user: SignerWithAddress;
  let vault: MammonVaultV1Mock;
  let validator: WithdrawalValidatorMock;
  let factory: BaseManagedPoolFactory;
  let tokens: IERC20[];
  let sortedTokens: string[];
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
    ({ tokens, sortedTokens } = await setupTokens());

    const validatorMock =
      await ethers.getContractFactory<WithdrawalValidatorMock__factory>(
        "WithdrawalValidatorMock",
      );

    validator = await validatorMock.connect(admin).deploy(tokens.length);

    const bVaultVactory =
      await ethers.getContractFactory<BalancerVaultMock__factory>(
        "BalancerVaultMock",
      );
    const bVault = await bVaultVactory.connect(admin).deploy(ZERO_ADDRESS);

    const factoryV1Factory =
      await ethers.getContractFactory<BaseManagedPoolFactory__factory>(
        "BaseManagedPoolFactory",
      );
    factory = await factoryV1Factory.connect(admin).deploy(bVault.address);

    const validWeights = valueArray(ONE.div(tokens.length), tokens.length);

    const vaultFactory =
      await ethers.getContractFactory<MammonVaultV1Mock__factory>(
        "MammonVaultV1Mock",
      );
    vault = await vaultFactory
      .connect(admin)
      .deploy(
        factory.address,
        "Test",
        "TEST",
        sortedTokens,
        validWeights,
        MIN_SWAP_FEE,
        manager.address,
        validator.address,
        DEFAULT_NOTICE_PERIOD,
        "Test vault description",
      );
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
          vault.deposit(valueArray(ONE, tokens.length)),
        ).to.be.revertedWith("Mammon__VaultNotInitialized");
      });

      it("when call withdraw", async () => {
        await expect(
          vault.withdraw(valueArray(ONE, tokens.length)),
        ).to.be.revertedWith("Mammon__VaultNotInitialized");
      });

      it("when call updateWeightsGradually", async () => {
        const blocknumber = await ethers.provider.getBlockNumber();
        await expect(
          vault
            .connect(manager)
            .updateWeightsGradually(
              [MIN_WEIGHT, MIN_WEIGHT],
              blocknumber + 1,
              blocknumber + 1000,
            ),
        ).to.be.revertedWith("Mammon__VaultNotInitialized");
      });

      it("when call initiateFinalization", async () => {
        await expect(vault.initiateFinalization()).to.be.revertedWith(
          "Mammon__VaultNotInitialized",
        );
      });
    });

    describe("should be reverted to initialize the vault", async () => {
      it("when token and amount length is not same", async () => {
        await expect(
          vault.initialDeposit(valueArray(ONE, tokens.length + 1)),
        ).to.be.revertedWith("Mammon__AmountLengthIsNotSame");
      });

      it("when amount exceeds allowance", async () => {
        const validAmounts = valueArray(ONE, tokens.length - 1);

        await expect(
          vault.initialDeposit([toWei(3), ...validAmounts]),
        ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");

        await expect(
          vault.initialDeposit([...validAmounts, toWei(3)]),
        ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
      });
    });

    it("should be possible to initialize the vault", async () => {
      await vault.initialDeposit(valueArray(ONE, tokens.length));

      expect(await vault.initialized()).to.equal(true);
    });
  });

  describe("when Vault is initialized", () => {
    beforeEach(async () => {
      for (let i = 0; i < tokens.length; i++) {
        await tokens[i].approve(vault.address, toWei(100));
      }
      await vault.initialDeposit(valueArray(ONE, tokens.length));
    });

    it("should be reverted to initialize the vault again", async () => {
      await expect(
        vault.initialDeposit(valueArray(ONE, tokens.length)),
      ).to.be.revertedWith("Mammon__VaultIsAlreadyInitialized");
    });

    describe("when depositing to Vault", () => {
      describe("should be reverted to deposit tokens", async () => {
        it("when called from non-owner", async () => {
          await expect(
            vault.connect(user).deposit(valueArray(ONE, tokens.length)),
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("when token and amount length is not same", async () => {
          await expect(
            vault.deposit(valueArray(ONE, tokens.length + 1)),
          ).to.be.revertedWith("Mammon__AmountLengthIsNotSame");
        });

        it("when amount exceeds allowance", async () => {
          await expect(
            vault.deposit(valueArray(toWei(100), tokens.length)),
          ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
        });
      });

      describe("should be possible to deposit tokens", async () => {
        it("when deposit one token", async () => {
          for (let i = 0; i < tokens.length; i++) {
            const amounts = new Array(tokens.length).fill(0);
            amounts[i] = toWei(5);

            const trx = await vault.deposit(amounts);
            const weights = await vault.getNormalizedWeights();
            await expect(trx)
              .to.emit(vault, "Deposit")
              .withArgs(amounts, weights);
          }
        });

        it("when deposit tokens", async () => {
          const amounts = tokens.map(_ =>
            toWei(Math.floor(Math.random() * 100)),
          );

          for (let i = 0; i < tokens.length; i++) {
            await tokens[i].approve(vault.address, amounts[i]);
          }

          const trx = await vault.deposit(amounts);
          const weights = await vault.getNormalizedWeights();
          await expect(trx)
            .to.emit(vault, "Deposit")
            .withArgs(amounts, weights);
        });
      });
    });

    describe("when withdrawing to Vault", () => {
      describe("when allowance on validator is invalid", () => {
        it("should revert to withdraw tokens", async () => {
          await expect(
            vault.withdraw(valueArray(toWei(5), tokens.length)),
          ).to.be.revertedWith("Mammon__AmountExceedAvailable");
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
              vault.connect(user).withdraw(valueArray(ONE, tokens.length)),
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("when token and amount length is not same", async () => {
            await expect(
              vault.withdraw(valueArray(ONE, tokens.length + 1)),
            ).to.be.revertedWith("Mammon__AmountLengthIsNotSame");
          });

          it("when amount exceeds holdings", async () => {
            const { holdings } = await getState();
            await expect(
              vault.withdraw([
                holdings[0].add(1),
                ...valueArray(ONE, tokens.length - 1),
              ]),
            ).to.be.revertedWith("Mammon__AmountExceedAvailable");
          });
        });

        describe("should be possible to withdraw ", async () => {
          it("when withdraw one token", async () => {
            await vault.deposit(valueArray(toWei(5), tokens.length));

            for (let i = 0; i < tokens.length; i++) {
              const amounts = new Array(tokens.length).fill(0);
              amounts[i] = toWei(5);

              const trx = await vault.withdraw(amounts);
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

          it("when withdraw tokens", async () => {
            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, toWei(100000));
            }
            await vault.deposit(valueArray(toWei(10000), tokens.length));

            const amounts = tokens.map(_ =>
              toWei(Math.floor(Math.random() * 100)),
            );

            const trx = await vault.withdraw(amounts);
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
              valueArray(ONE.div(tokens.length), tokens.length),
              0,
              1,
            ),
          ).to.be.revertedWith("Mammon__CallerIsNotManager");
        });

        it("when duration is less than minimum", async () => {
          const timestamp = await getCurrentTime();
          await expect(
            vault
              .connect(manager)
              .updateWeightsGradually(
                valueArray(ONE.div(tokens.length), tokens.length),
                timestamp,
                timestamp + 1,
              ),
          ).to.be.revertedWith("Mammon__WeightChangeDurationIsBelowMin");
        });

        it("when actual duration is less than minimum", async () => {
          const timestamp = await getCurrentTime();
          await expect(
            vault
              .connect(manager)
              .updateWeightsGradually(
                valueArray(ONE.div(tokens.length), tokens.length),
                timestamp - 2,
                timestamp + MINIMUM_WEIGHT_CHANGE_DURATION - 1,
              ),
          ).to.be.revertedWith("Mammon__WeightChangeDurationIsBelowMin");
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
            .updateWeightsGradually(endWeights, startTime, endTime),
        )
          .to.emit(vault, "UpdateWeightsGradually")
          .withArgs(startTime, endTime, endWeights);
      });
    });

    describe("when finalizing", () => {
      describe("should be reverted to call initiateFinalization", async () => {
        it("when called from non-owner", async () => {
          await expect(
            vault.connect(manager).initiateFinalization(),
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });
      });

      describe("should be reverted to call finalize", async () => {
        it("when called from non-owner", async () => {
          await expect(vault.connect(user).finalize()).to.be.revertedWith(
            "Ownable: caller is not the owner",
          );
        });

        it("when finalization is not initialized", async () => {
          await expect(vault.finalize()).to.be.revertedWith(
            "Mammon__FinalizationNotInitialized",
          );
        });

        it("when noticeTimeout is not elapsed", async () => {
          await vault.initiateFinalization();
          const noticeTimeoutAt = await vault.noticeTimeoutAt();

          await expect(vault.finalize()).to.be.revertedWith(
            `Mammon__NoticeTimeoutNotElapsed(${noticeTimeoutAt})`,
          );
        });
      });

      describe("should be reverted to call functions when finalizing", async () => {
        beforeEach(async () => {
          await vault.initiateFinalization();
        });

        it("when call deposit", async () => {
          await expect(
            vault.deposit(valueArray(ONE, tokens.length)),
          ).to.be.revertedWith("Mammon__VaultIsFinalizing");
        });

        it("when call withdraw", async () => {
          await expect(
            vault.withdraw(valueArray(ONE, tokens.length)),
          ).to.be.revertedWith("Mammon__VaultIsFinalizing");
        });

        it("when call updateWeightsGradually", async () => {
          const blocknumber = await ethers.provider.getBlockNumber();
          await expect(
            vault
              .connect(manager)
              .updateWeightsGradually(
                valueArray(MIN_WEIGHT, tokens.length),
                blocknumber + 1,
                blocknumber + 1000,
              ),
          ).to.be.revertedWith("Mammon__VaultIsFinalizing");
        });

        it("when call initiateFinalization", async () => {
          await expect(vault.initiateFinalization()).to.be.revertedWith(
            "Mammon__VaultIsFinalizing",
          );
        });
      });

      it("should be possible to finalize", async () => {
        const trx = await vault.initiateFinalization();
        const noticeTimeoutAt = await vault.noticeTimeoutAt();
        await expect(trx)
          .to.emit(vault, "FinalizationInitialized")
          .withArgs(noticeTimeoutAt);

        await ethers.provider.send("evm_increaseTime", [NOTICE_PERIOD + 1]);

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
      await vault.initialDeposit(valueArray(ONE, tokens.length));
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

      it("when amount exceeds balance", async () => {
        await expect(
          vault.sweep(TOKEN.address, toWei(1001)),
        ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
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
            "Mammon__ManagerIsZeroAddress",
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

    describe("Enable Trading", () => {
      beforeEach(async () => {
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, ONE);
        }
        await vault.initialDeposit(valueArray(ONE, tokens.length));
      });

      it("should be reverted to enable trading", async () => {
        await expect(
          vault
            .connect(manager)
            .enableTrading(valueArray(ONE.div(tokens.length), tokens.length)),
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should be possible to enable trading", async () => {
        await expect(
          vault.enableTrading(
            valueArray(ONE.div(tokens.length), tokens.length),
          ),
        )
          .to.emit(vault, "SetSwapEnabled")
          .withArgs(true);

        expect(await vault.isSwapEnabled()).to.equal(true);
      });
    });

    describe("Disable Trading", () => {
      beforeEach(async () => {
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, ONE);
        }
        await vault.initialDeposit(valueArray(ONE, tokens.length));
      });

      it("should be reverted to disable trading", async () => {
        await expect(vault.connect(user).disableTrading()).to.be.revertedWith(
          "Mammon__CallerIsNotOwnerOrManager",
        );
      });

      it("should be possible to disable trading", async () => {
        await expect(vault.connect(manager).disableTrading())
          .to.emit(vault, "SetSwapEnabled")
          .withArgs(false);

        expect(await vault.isSwapEnabled()).to.equal(false);
      });
    });

    describe("Set Swap Fee", () => {
      it("should revert when called from non-manager", async () => {
        await expect(vault.setSwapFee(toWei(3))).to.be.revertedWith(
          "Mammon__CallerIsNotManager()",
        );
      });

      describe("when called by manager", () => {
        const maxFeeDelta = toWei(0.0005);

        let managerVault: MammonVaultV1Mock;
        beforeEach(async () => {
          managerVault = vault.connect(manager);
        });

        it("should emit SetSwapFee event", async () => {
          const newFee = MIN_SWAP_FEE.add(1);
          await expect(managerVault.setSwapFee(newFee))
            .to.emit(managerVault, "SetSwapFee")
            .withArgs(newFee);
        });

        it("should update underlying pool fee", async () => {
          const newFee = MIN_SWAP_FEE.add(1);
          await managerVault.setSwapFee(newFee);
          expect(await managerVault.getSwapFee()).to.equal(newFee);
        });

        it("should revert when positive change exceeds max", async () => {
          const newFee = MIN_SWAP_FEE.add(maxFeeDelta);
          await managerVault.setSwapFee(newFee);
          const invalidFee = newFee.add(maxFeeDelta).add(1);
          await expect(managerVault.setSwapFee(invalidFee)).to.be.revertedWith(
            "Mammon__SwapFeePercentageChangeIsAboveMax",
          );
        });

        it("should revert when negative change exceeds max", async () => {
          const feeOne = MIN_SWAP_FEE.add(maxFeeDelta);
          await managerVault.setSwapFee(feeOne);
          const feeTwo = feeOne.add(maxFeeDelta);
          await managerVault.setSwapFee(feeTwo);
          const invalidFee = feeTwo.sub(maxFeeDelta).sub(1);
          await expect(managerVault.setSwapFee(invalidFee)).to.be.revertedWith(
            "Mammon__SwapFeePercentageChangeIsAboveMax",
          );
        });
      });
    });

    describe("Renounce Ownership", () => {
      describe("should be reverted", () => {
        it("when called from non-owner", async () => {
          await expect(
            vault.connect(user).renounceOwnership(),
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("when called from owner", async () => {
          await expect(vault.renounceOwnership()).to.be.revertedWith(
            "Mammon__VaultIsNotRenounceable",
          );
        });
      });
    });
  });
});
