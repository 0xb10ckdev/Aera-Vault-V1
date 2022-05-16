import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import hre, { deployments, ethers } from "hardhat";
import { DEFAULT_NOTICE_PERIOD, getConfig } from "../../../scripts/config";
import {
  IERC20,
  BaseManagedPoolFactory,
  BaseManagedPoolFactory__factory,
  MammonVaultV1Mock,
  WithdrawalValidatorMock,
  WithdrawalValidatorMock__factory,
} from "../../../typechain";
import {
  BALANCER_ERRORS,
  DEVIATION,
  MAX_MANAGEMENT_FEE,
  MAX_NOTICE_PERIOD,
  MAX_SWAP_FEE,
  MAX_WEIGHT_CHANGE_RATIO,
  MINIMUM_WEIGHT_CHANGE_DURATION,
  MIN_SWAP_FEE,
  MIN_WEIGHT,
  NOTICE_PERIOD,
  ONE,
  ZERO_ADDRESS,
} from "../constants";
import { deployToken, setupTokens } from "../fixtures";
import {
  deployFactory,
  deployVault,
  getCurrentTime,
  getTimestamp,
  increaseTime,
  toWei,
  valueArray,
  VaultParams,
} from "../utils";

describe("Mammon Vault V1 Mainnet Deployment", function () {
  let admin: SignerWithAddress;
  let manager: SignerWithAddress;
  let validator: WithdrawalValidatorMock;
  let factory: BaseManagedPoolFactory;
  let tokens: IERC20[];
  let sortedTokens: string[];
  let unsortedTokens: string[];
  let snapshot: unknown;
  let validWeights: string[];
  let validParams: VaultParams;

  describe("should be reverted to deploy vault", async () => {
    before(async function () {
      snapshot = await ethers.provider.send("evm_snapshot", []);
      ({ admin, manager } = await ethers.getNamedSigners());

      ({ tokens, sortedTokens, unsortedTokens } = await setupTokens());
      validWeights = valueArray(ONE.div(tokens.length), tokens.length);

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
      validParams = {
        signer: admin,
        factory: factory.address,
        name: "Test",
        symbol: "TEST",
        tokens: sortedTokens,
        weights: validWeights,
        swapFeePercentage: MIN_SWAP_FEE,
        manager: manager.address,
        validator: validator.address,
        noticePeriod: MAX_NOTICE_PERIOD,
        managementFee: MAX_MANAGEMENT_FEE,
        description: "",
      };
    });

    after(async () => {
      await ethers.provider.send("evm_revert", [snapshot]);
    });

    it("when token and weight length is not same", async () => {
      validParams.tokens = [...sortedTokens, tokens[0].address];
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Mammon__WeightLengthIsNotSame",
      );
    });

    it("when management fee is greater than maximum", async () => {
      validParams.managementFee = MAX_MANAGEMENT_FEE.add(1);
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Mammon__ManagementFeeIsAboveMax",
      );
    });

    it("when notice period is greater than maximum", async () => {
      validParams.noticePeriod = MAX_NOTICE_PERIOD + 1;
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Mammon__NoticePeriodIsAboveMax",
      );
    });

    it("when validator is not valid", async () => {
      validParams.validator = manager.address;
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Mammon__ValidatorIsNotValid",
      );

      validParams.validator = (
        await deployments.get("InvalidValidator")
      ).address;
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Mammon__ValidatorIsNotValid",
      );
    });

    it("when token is not sorted in ascending order", async () => {
      validParams.tokens = unsortedTokens;
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
      validParams.weights = valueArray(MIN_WEIGHT, tokens.length);
      await expect(deployVault(validParams)).to.be.revertedWith(
        BALANCER_ERRORS.NORMALIZED_WEIGHT_INVARIANT,
      );
    });

    it("when manager is zero address", async () => {
      validParams.manager = ZERO_ADDRESS;
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Mammon__ManagerIsZeroAddress",
      );
    });
  });
});

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

  const getAdminBalances = async () => {
    const balances = await Promise.all(
      tokens.map(token => token.balanceOf(admin.address)),
    );
    return balances;
  };

  const getManagerBalances = async () => {
    const balances = await Promise.all(
      tokens.map(token => token.balanceOf(manager.address)),
    );
    return balances;
  };

  const getState = async () => {
    const [holdings, adminBalances, managerBalances] = await Promise.all([
      vault.getHoldings(),
      getAdminBalances(),
      getManagerBalances(),
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
    ({ tokens, sortedTokens } = await setupTokens());

    const validatorMock =
      await ethers.getContractFactory<WithdrawalValidatorMock__factory>(
        "WithdrawalValidatorMock",
      );

    validator = await validatorMock.connect(admin).deploy(tokens.length);

    const factoryV1Factory =
      await ethers.getContractFactory<BaseManagedPoolFactory__factory>(
        "BaseManagedPoolFactory",
      );
    factory = await factoryV1Factory.connect(admin).deploy(config.bVault);

    const validWeights = valueArray(ONE.div(tokens.length), tokens.length);

    vault = await hre.run("deploy:vault", {
      factory: factory.address,
      name: "Test",
      symbol: "TEST",
      tokens: sortedTokens.join(","),
      weights: validWeights.join(","),
      swapFee: MIN_SWAP_FEE.toString(),
      manager: manager.address,
      validator: validator.address,
      noticePeriod: DEFAULT_NOTICE_PERIOD.toString(),
      managementFee: MAX_MANAGEMENT_FEE.toString(),
      description: "Test vault description",
      silent: true,
      test: true,
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
          vault.deposit(valueArray(ONE, tokens.length)),
        ).to.be.revertedWith("Mammon__VaultNotInitialized");
      });

      it("when call depositIfBalanceUnchanged", async () => {
        await expect(
          vault.depositIfBalanceUnchanged(valueArray(ONE, tokens.length)),
        ).to.be.revertedWith("Mammon__VaultNotInitialized");
      });

      it("when call withdraw", async () => {
        await expect(
          vault.withdraw(valueArray(ONE, tokens.length)),
        ).to.be.revertedWith("Mammon__VaultNotInitialized");
      });

      it("when call withdrawIfBalanceUnchanged", async () => {
        await expect(
          vault.withdrawIfBalanceUnchanged(valueArray(ONE, tokens.length)),
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

      it("when call cancelWeightUpdates", async () => {
        await expect(
          vault.connect(manager).cancelWeightUpdates(),
        ).to.be.revertedWith("Mammon__VaultNotInitialized");
      });

      it("when call claimManagerFees", async () => {
        await expect(
          vault.connect(manager).claimManagerFees(),
        ).to.be.revertedWith("Mammon__VaultNotInitialized");
      });

      it("when call initiateFinalization", async () => {
        await expect(vault.initiateFinalization()).to.be.revertedWith(
          "Mammon__VaultNotInitialized",
        );
      });

      it("when call finalize", async () => {
        await expect(vault.finalize()).to.be.revertedWith(
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

      it("when amount is zero", async () => {
        const validAmounts = valueArray(ONE, tokens.length - 1);

        await expect(
          vault.initialDeposit([0, ...validAmounts]),
        ).to.be.revertedWith(BALANCER_ERRORS.ZERO_INVARIANT);

        await expect(
          vault.initialDeposit([...validAmounts, 0]),
        ).to.be.revertedWith(BALANCER_ERRORS.ZERO_INVARIANT);
      });
    });

    it("should be possible to initialize the vault", async () => {
      const balances = await getAdminBalances();

      await vault.initialDeposit(valueArray(ONE, tokens.length));

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
        it("when depositing one token", async () => {
          let { holdings, adminBalances, managerBalances } = await getState();

          for (let i = 0; i < tokens.length; i++) {
            const amounts = new Array(tokens.length).fill(0);
            amounts[i] = toWei(5);

            const spotPrices = await vault.getSpotPrices(tokens[i].address);
            const lastFeeCheckpoint = await vault.lastFeeCheckpoint();

            const trx = await vault.deposit(amounts);

            const currentTime = await getTimestamp(trx.blockNumber);
            const feeIndex = MAX_MANAGEMENT_FEE.mul(
              currentTime - lastFeeCheckpoint.toNumber(),
            );
            const newSpotPrices = await vault.getSpotPrices(tokens[i].address);
            const {
              holdings: newHoldings,
              adminBalances: newAdminBalances,
              managerBalances: newManagerBalances,
            } = await getState();

            for (let j = 0; j < tokens.length; j++) {
              const fee = holdings[j].mul(feeIndex).div(ONE);

              expect(newSpotPrices[j]).to.be.at.closeTo(
                spotPrices[j],
                DEVIATION,
              );
              expect(newHoldings[j]).to.equal(
                holdings[j].add(amounts[j]).sub(fee),
              );
              expect(newAdminBalances[j]).to.equal(
                adminBalances[j].sub(amounts[j]),
              );
              expect(newManagerBalances[j]).to.equal(
                managerBalances[j].add(fee),
              );
            }

            holdings = newHoldings;
            adminBalances = newAdminBalances;
            managerBalances = newManagerBalances;
          }
        });

        it("when depositing tokens", async () => {
          const { holdings, adminBalances, managerBalances } =
            await getState();
          const lastFeeCheckpoint = await vault.lastFeeCheckpoint();

          const amounts = tokens.map(_ =>
            toWei(Math.floor(Math.random() * 100)),
          );

          const spotPrices = [];
          for (let i = 0; i < tokens.length; i++) {
            await tokens[i].approve(vault.address, amounts[i]);
            spotPrices.push(await vault.getSpotPrices(tokens[i].address));
          }

          const trx = await vault.deposit(amounts);

          const currentTime = await getTimestamp(trx.blockNumber);
          const feeIndex = MAX_MANAGEMENT_FEE.mul(
            currentTime - lastFeeCheckpoint.toNumber(),
          );
          const {
            holdings: newHoldings,
            adminBalances: newAdminBalances,
            managerBalances: newManagerBalances,
          } = await getState();

          for (let i = 0; i < tokens.length; i++) {
            const fee = holdings[i].mul(feeIndex).div(ONE);
            const newSpotPrices = await vault.getSpotPrices(tokens[i].address);

            expect(
              await vault.getSpotPrice(
                tokens[i].address,
                tokens[(i + 1) % tokens.length].address,
              ),
            ).to.equal(newSpotPrices[(i + 1) % tokens.length]);

            for (let j = 0; j < tokens.length; j++) {
              expect(newSpotPrices[j]).to.be.at.closeTo(
                spotPrices[i][j],
                DEVIATION,
              );
            }

            expect(await vault.holding(i)).to.equal(newHoldings[i]);
            expect(newHoldings[i]).to.equal(
              holdings[i].add(amounts[i]).sub(fee),
            );
            expect(newAdminBalances[i]).to.equal(
              adminBalances[i].sub(amounts[i]),
            );
            expect(newManagerBalances[i]).to.equal(
              managerBalances[i].add(fee),
            );
          }
        });
      });
    });

    describe("when withdrawing from Vault", () => {
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
          it("when withdrawing one token", async () => {
            await vault.deposit(valueArray(toWei(5), tokens.length));
            let { holdings, adminBalances, managerBalances } =
              await getState();

            for (let i = 0; i < tokens.length; i++) {
              const amounts = new Array(tokens.length).fill(0);
              amounts[i] = toWei(5);

              const spotPrices = await vault.getSpotPrices(tokens[i].address);
              const lastFeeCheckpoint = await vault.lastFeeCheckpoint();

              const trx = await vault.withdraw(amounts);

              const currentTime = await getTimestamp(trx.blockNumber);
              const feeIndex = MAX_MANAGEMENT_FEE.mul(
                currentTime - lastFeeCheckpoint.toNumber(),
              );
              const newSpotPrices = await vault.getSpotPrices(
                tokens[i].address,
              );
              const {
                holdings: newHoldings,
                adminBalances: newAdminBalances,
                managerBalances: newManagerBalances,
              } = await getState();

              for (let j = 0; j < tokens.length; j++) {
                const fee = holdings[j].mul(feeIndex).div(ONE);

                expect(newSpotPrices[j]).to.be.at.closeTo(
                  spotPrices[j],
                  DEVIATION,
                );
                expect(newHoldings[j]).to.equal(
                  holdings[j].sub(amounts[j]).sub(fee),
                );
                expect(newAdminBalances[j]).to.equal(
                  adminBalances[j].add(amounts[j]),
                );
                expect(newManagerBalances[j]).to.equal(
                  managerBalances[j].add(fee),
                );
              }

              holdings = newHoldings;
              adminBalances = newAdminBalances;
              managerBalances = newManagerBalances;
            }
          });

          it("when withdrawing tokens", async () => {
            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, toWei(100000));
            }
            await vault.deposit(valueArray(toWei(10000), tokens.length));

            const { holdings, adminBalances, managerBalances } =
              await getState();
            const lastFeeCheckpoint = await vault.lastFeeCheckpoint();

            const amounts = tokens.map(_ =>
              toWei(Math.floor(Math.random() * 100)),
            );

            const spotPrices = [];
            for (let i = 0; i < tokens.length; i++) {
              spotPrices.push(await vault.getSpotPrices(tokens[i].address));
            }

            const trx = await vault.withdraw(amounts);

            const currentTime = await getTimestamp(trx.blockNumber);
            const feeIndex = MAX_MANAGEMENT_FEE.mul(
              currentTime - lastFeeCheckpoint.toNumber(),
            );
            const {
              holdings: newHoldings,
              adminBalances: newAdminBalances,
              managerBalances: newManagerBalances,
            } = await getState();

            for (let i = 0; i < tokens.length; i++) {
              const fee = holdings[i].mul(feeIndex).div(ONE);
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
                expect(newSpotPrices[j]).to.be.at.closeTo(
                  spotPrices[i][j],
                  DEVIATION,
                );
              }

              expect(await vault.holding(i)).to.equal(newHoldings[i]);
              expect(newHoldings[i]).to.equal(
                holdings[i].sub(amounts[i]).sub(fee),
              );
              expect(newAdminBalances[i]).to.equal(
                adminBalances[i].add(amounts[i]),
              );
              expect(newManagerBalances[i]).to.equal(
                managerBalances[i].add(fee),
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
        let { holdings, adminBalances, managerBalances } = await getState();
        for (let i = 0; i < tokens.length; i++) {
          const amounts = new Array(tokens.length).fill(0);
          amounts[i] = toWei(5);

          const spotPrices = await vault.getSpotPrices(tokens[i].address);
          const lastFeeCheckpoint = await vault.lastFeeCheckpoint();

          const trx1 = await vault.deposit(amounts);
          const trx2 = await vault.withdraw(amounts);

          const trx1Time = await getTimestamp(trx1.blockNumber);
          const trx2Time = await getTimestamp(trx2.blockNumber);
          const feeIndex1 = MAX_MANAGEMENT_FEE.mul(
            trx1Time - lastFeeCheckpoint.toNumber(),
          );
          const feeIndex2 = MAX_MANAGEMENT_FEE.mul(trx2Time - trx1Time);

          const newSpotPrices = await vault.getSpotPrices(tokens[i].address);
          const {
            holdings: newHoldings,
            adminBalances: newAdminBalances,
            managerBalances: newManagerBalances,
          } = await getState();

          for (let j = 0; j < tokens.length; j++) {
            const fee1 = holdings[j].mul(feeIndex1).div(ONE);
            const fee2 = holdings[j]
              .sub(fee1)
              .add(amounts[j])
              .mul(feeIndex2)
              .div(ONE);

            expect(newSpotPrices[j]).to.be.at.closeTo(
              spotPrices[j],
              DEVIATION,
            );
            expect(newHoldings[j]).to.equal(holdings[j].sub(fee1).sub(fee2));
            expect(newAdminBalances[j]).to.equal(adminBalances[j]);
            expect(newManagerBalances[j]).to.equal(
              managerBalances[j].add(fee1).add(fee2),
            );
          }

          holdings = newHoldings;
          adminBalances = newAdminBalances;
          managerBalances = newManagerBalances;
        }
      });

      it("when depositing and withdrawing tokens", async () => {
        const { holdings, adminBalances, managerBalances } = await getState();
        const lastFeeCheckpoint = await vault.lastFeeCheckpoint();

        const amounts = tokens.map(_ =>
          toWei(Math.floor(Math.random() * 100)),
        );

        const spotPrices = [];
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, amounts[i]);
          spotPrices.push(await vault.getSpotPrices(tokens[i].address));
        }

        const trx1 = await vault.deposit(amounts);
        const trx2 = await vault.withdraw(amounts);

        const trx1Time = await getTimestamp(trx1.blockNumber);
        const trx2Time = await getTimestamp(trx2.blockNumber);
        const feeIndex1 = MAX_MANAGEMENT_FEE.mul(
          trx1Time - lastFeeCheckpoint.toNumber(),
        );
        const feeIndex2 = MAX_MANAGEMENT_FEE.mul(trx2Time - trx1Time);
        const {
          holdings: newHoldings,
          adminBalances: newAdminBalances,
          managerBalances: newManagerBalances,
        } = await getState();

        for (let i = 0; i < tokens.length; i++) {
          const fee1 = holdings[i].mul(feeIndex1).div(ONE);
          const fee2 = holdings[i]
            .sub(fee1)
            .add(amounts[i])
            .mul(feeIndex2)
            .div(ONE);
          const newSpotPrices = await vault.getSpotPrices(tokens[i].address);

          expect(
            await vault.getSpotPrice(
              tokens[i].address,
              tokens[(i + 1) % tokens.length].address,
            ),
          ).to.equal(newSpotPrices[(i + 1) % tokens.length]);

          for (let j = 0; j < tokens.length; j++) {
            expect(newSpotPrices[j]).to.be.at.closeTo(
              spotPrices[i][j],
              DEVIATION,
            );
          }

          expect(await vault.holding(i)).to.equal(newHoldings[i]);
          expect(newHoldings[i]).to.equal(holdings[i].sub(fee1).sub(fee2));
          expect(newAdminBalances[i]).to.equal(adminBalances[i]);
          expect(newManagerBalances[i]).to.equal(
            managerBalances[i].add(fee1).add(fee2),
          );
        }
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

        it("when total sum of weights is not one", async () => {
          const timestamp = await getCurrentTime();
          await expect(
            vault
              .connect(manager)
              .updateWeightsGradually(
                valueArray(ONE.div(tokens.length).sub(1), tokens.length),
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
                targetWeights,
                timestamp,
                timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1,
              ),
          ).to.be.revertedWith("Mammon__WeightChangeRatioIsAboveMax");
        });

        it("when weight is less than minimum", async () => {
          const timestamp = await getCurrentTime();
          await expect(
            vault
              .connect(manager)
              .updateWeightsGradually(
                [
                  toWei(0.009),
                  ...valueArray(
                    ONE.sub(toWei(0.009)).div(tokens.length - 1),
                    tokens.length - 1,
                  ),
                ],
                timestamp,
                timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1,
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
          .updateWeightsGradually(endWeights, startTime, endTime);

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
          expect(startWeights[i].add(weightDelta)).to.be.at.closeTo(
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
            .updateWeightsGradually(endWeights, startTime, endTime);

          const { holdings, adminBalances, managerBalances } =
            await getState();
          const lastFeeCheckpoint = await vault.lastFeeCheckpoint();

          const spotPrices = [];
          for (let i = 0; i < tokens.length; i++) {
            spotPrices.push(await vault.getSpotPrices(tokens[i].address));
          }

          const trx = await vault.deposit(
            valueArray(toWei(50), tokens.length),
          );

          const currentTime = await getTimestamp(trx.blockNumber);
          const feeIndex = MAX_MANAGEMENT_FEE.mul(
            currentTime - lastFeeCheckpoint.toNumber(),
          );
          const {
            holdings: newHoldings,
            adminBalances: newAdminBalances,
            managerBalances: newManagerBalances,
          } = await getState();

          for (let i = 0; i < tokens.length; i++) {
            const fee = holdings[i].mul(feeIndex).div(ONE);
            const newSpotPrices = await vault.getSpotPrices(tokens[i].address);

            expect(
              await vault.getSpotPrice(
                tokens[i].address,
                tokens[(i + 1) % tokens.length].address,
              ),
            ).to.equal(newSpotPrices[(i + 1) % tokens.length]);

            for (let j = 0; j < tokens.length; j++) {
              expect(newSpotPrices[j]).to.be.at.closeTo(
                spotPrices[i][j],
                DEVIATION,
              );
            }
            expect(await vault.holding(i)).to.equal(newHoldings[i]);
            expect(newHoldings[i]).to.equal(
              holdings[i].add(toWei(50)).sub(fee),
            );
            expect(newAdminBalances[i]).to.equal(
              adminBalances[i].sub(toWei(50)),
            );
            expect(newManagerBalances[i]).to.equal(
              managerBalances[i].add(fee),
            );
          }

          const newWeights = await vault.getNormalizedWeights();

          for (let i = 0; i < 1000; i++) {
            await ethers.provider.send("evm_mine", []);
          }

          const currentWeights = await vault.getNormalizedWeights();

          for (let i = 0; i < tokens.length; i++) {
            expect(newWeights[i]).to.be.equal(currentWeights[i]);
          }
        });

        it("when withdraw tokens", async () => {
          await validator.setAllowances(
            valueArray(toWei(100000), tokens.length),
          );
          await vault.deposit(valueArray(toWei(50), tokens.length));

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
            .updateWeightsGradually(endWeights, startTime, endTime);

          const { holdings, adminBalances, managerBalances } =
            await getState();
          const lastFeeCheckpoint = await vault.lastFeeCheckpoint();

          const spotPrices = [];
          for (let i = 0; i < tokens.length; i++) {
            spotPrices.push(await vault.getSpotPrices(tokens[i].address));
          }

          const trx = await vault.withdraw(
            valueArray(toWei(50), tokens.length),
          );

          const currentTime = await getTimestamp(trx.blockNumber);
          const feeIndex = MAX_MANAGEMENT_FEE.mul(
            currentTime - lastFeeCheckpoint.toNumber(),
          );
          const {
            holdings: newHoldings,
            adminBalances: newAdminBalances,
            managerBalances: newManagerBalances,
          } = await getState();

          for (let i = 0; i < tokens.length; i++) {
            const fee = holdings[i].mul(feeIndex).div(ONE);
            const newSpotPrices = await vault.getSpotPrices(tokens[i].address);

            expect(
              await vault.getSpotPrice(
                tokens[i].address,
                tokens[(i + 1) % tokens.length].address,
              ),
            ).to.equal(newSpotPrices[(i + 1) % tokens.length]);

            for (let j = 0; j < tokens.length; j++) {
              expect(newSpotPrices[j]).to.be.at.closeTo(
                spotPrices[i][j],
                DEVIATION,
              );
            }
            expect(await vault.holding(i)).to.equal(newHoldings[i]);
            expect(newHoldings[i]).to.equal(
              holdings[i].sub(toWei(50)).sub(fee),
            );
            expect(newAdminBalances[i]).to.equal(
              adminBalances[i].add(toWei(50)),
            );
            expect(newManagerBalances[i]).to.equal(
              managerBalances[i].add(fee),
            );
          }

          const newWeights = await vault.getNormalizedWeights();

          for (let i = 0; i < 1000; i++) {
            await ethers.provider.send("evm_mine", []);
          }

          const currentWeights = await vault.getNormalizedWeights();

          for (let i = 0; i < tokens.length; i++) {
            expect(newWeights[i]).to.be.equal(currentWeights[i]);
          }
        });
      });
    });

    describe("when calling cancelWeightUpdates()", () => {
      it("should be reverted when called from non-manager", async () => {
        await expect(vault.cancelWeightUpdates()).to.be.revertedWith(
          "Mammon__CallerIsNotManager",
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
          .updateWeightsGradually(endWeights, startTime, endTime);

        await increaseTime(MINIMUM_WEIGHT_CHANGE_DURATION / 2);

        await vault.connect(manager).cancelWeightUpdates();

        const newWeights = await vault.getNormalizedWeights();

        await increaseTime(MINIMUM_WEIGHT_CHANGE_DURATION / 2);

        const currentWeights = await vault.getNormalizedWeights();

        for (let i = 0; i < tokens.length; i++) {
          expect(newWeights[i]).to.be.equal(currentWeights[i]);
        }
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

        it("when finalization is not initiated", async () => {
          await expect(vault.finalize()).to.be.revertedWith(
            "Mammon__FinalizationNotInitiated",
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

        it("when call cancelWeightUpdates", async () => {
          await expect(
            vault.connect(manager).cancelWeightUpdates(),
          ).to.be.revertedWith("Mammon__VaultIsFinalizing");
        });

        it("when call claimManagerFees", async () => {
          await expect(
            vault.connect(manager).claimManagerFees(),
          ).to.be.revertedWith("Mammon__VaultIsFinalizing");
        });

        it("when call initiateFinalization", async () => {
          await expect(vault.initiateFinalization()).to.be.revertedWith(
            "Mammon__VaultIsFinalizing",
          );
        });
      });

      it("should be possible to finalize", async () => {
        const { holdings, adminBalances, managerBalances } = await getState();
        const lastFeeCheckpoint = await vault.lastFeeCheckpoint();

        const trx = await vault.initiateFinalization();

        const currentTime = await getTimestamp(trx.blockNumber);
        const feeIndex = MAX_MANAGEMENT_FEE.mul(
          currentTime - lastFeeCheckpoint.toNumber(),
        );

        const { holdings: newHoldings, managerBalances: newManagerBalances } =
          await getState();

        for (let i = 0; i < tokens.length; i++) {
          const fee = holdings[i].mul(feeIndex).div(ONE);

          expect(newHoldings[i]).to.equal(holdings[i].sub(fee));
          expect(newManagerBalances[i]).to.equal(managerBalances[i].add(fee));
        }

        await increaseTime(NOTICE_PERIOD + 1);

        await vault.finalize();

        const newAdminBalances = await getAdminBalances();

        for (let i = 0; i < tokens.length; i++) {
          expect(newAdminBalances[i]).to.equal(
            adminBalances[i].add(newHoldings[i]),
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

  describe("claimManagerFees", () => {
    beforeEach(async () => {
      for (let i = 0; i < tokens.length; i++) {
        await tokens[i].approve(vault.address, toWei(10000));
      }
      await vault.initialDeposit(valueArray(toWei(10000), tokens.length));
    });

    it("should be reverted when called from non-manager", async () => {
      await expect(vault.claimManagerFees()).to.be.revertedWith(
        "Mammon__CallerIsNotManager",
      );
    });

    it("should be possible to claim manager fee", async () => {
      const { holdings, managerBalances } = await getState();
      const lastFeeCheckpoint = await vault.lastFeeCheckpoint();

      await increaseTime(500);

      const trx = await vault.connect(manager).claimManagerFees();

      const currentTime = await getTimestamp(trx.blockNumber);
      const feeIndex = MAX_MANAGEMENT_FEE.mul(
        currentTime - lastFeeCheckpoint.toNumber(),
      );
      const { holdings: newHoldings, managerBalances: newManagerBalances } =
        await getState();

      for (let i = 0; i < tokens.length; i++) {
        const fee = holdings[i].mul(feeIndex).div(ONE);

        expect(newHoldings[i]).to.equal(holdings[i].sub(fee));
        expect(newManagerBalances[i]).to.equal(managerBalances[i].add(fee));
      }
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

      describe("should be possible to change manager", async () => {
        it("should withdraw no fee when Vault is not initialized", async () => {
          const { holdings, managerBalances } = await getState();

          await increaseTime(1000);

          await vault.setManager(user.address);

          const {
            holdings: newHoldings,
            managerBalances: newManagerBalances,
          } = await getState();

          for (let i = 0; i < tokens.length; i++) {
            expect(newHoldings[i]).to.equal(holdings[i]);
            expect(newManagerBalances[i]).to.equal(managerBalances[i]);
          }

          expect(await vault.manager()).to.equal(user.address);
        });

        it("should withdraw no fee when Vault is finalizing", async () => {
          for (let i = 0; i < tokens.length; i++) {
            await tokens[i].approve(vault.address, toWei(10000));
          }
          await vault.initialDeposit(valueArray(toWei(10000), tokens.length));
          await vault.initiateFinalization();

          const { holdings, managerBalances } = await getState();

          await increaseTime(1000);

          await vault.setManager(user.address);

          const {
            holdings: newHoldings,
            managerBalances: newManagerBalances,
          } = await getState();

          for (let i = 0; i < tokens.length; i++) {
            expect(newHoldings[i]).to.equal(holdings[i]);
            expect(newManagerBalances[i]).to.equal(managerBalances[i]);
          }

          expect(await vault.manager()).to.equal(user.address);
        });

        it("should withdraw fees when Vault is initialized", async () => {
          for (let i = 0; i < tokens.length; i++) {
            await tokens[i].approve(vault.address, toWei(10000));
          }
          await vault.initialDeposit(valueArray(toWei(10000), tokens.length));

          const { holdings, managerBalances } = await getState();
          const lastFeeCheckpoint = await vault.lastFeeCheckpoint();

          await increaseTime(1000);

          const trx = await vault.setManager(user.address);

          const currentTime = await getTimestamp(trx.blockNumber);
          const feeIndex = MAX_MANAGEMENT_FEE.mul(
            currentTime - lastFeeCheckpoint.toNumber(),
          );
          const {
            holdings: newHoldings,
            managerBalances: newManagerBalances,
          } = await getState();

          for (let i = 0; i < tokens.length; i++) {
            const fee = holdings[i].mul(feeIndex).div(ONE);

            expect(newHoldings[i]).to.equal(holdings[i].sub(fee));
            expect(newManagerBalances[i]).to.equal(
              managerBalances[i].add(fee),
            );
          }

          expect(await vault.manager()).to.equal(user.address);
        });
      });
    });

    describe("Enable Trading", () => {
      beforeEach(async () => {
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, ONE);
        }
        await vault.initialDeposit(valueArray(ONE, tokens.length));
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
            expect(weights[i]).to.be.equal(currentWeights[i]);
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
                  valueArray(ONE.div(tokens.length), tokens.length),
                ),
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("when total sum of weights is not one", async () => {
            await expect(
              vault.enableTradingWithWeights(
                valueArray(ONE.div(tokens.length).sub(1), tokens.length),
              ),
            ).to.be.revertedWith(BALANCER_ERRORS.NORMALIZED_WEIGHT_INVARIANT);
          });

          it("when swap is already enabled", async () => {
            await vault.enableTradingRiskingArbitrage();

            await expect(
              vault.enableTradingWithWeights(
                valueArray(ONE.div(tokens.length), tokens.length),
              ),
            ).to.be.revertedWith("Mammon__PoolSwapIsAlreadyEnabled");
          });
        });

        it("should be possible to enable trading", async () => {
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

          await vault.enableTradingWithWeights(newWeights);

          const currentWeights = await vault.getNormalizedWeights();

          expect(await vault.isSwapEnabled()).to.equal(true);
          for (let i = 0; i < tokens.length; i++) {
            expect(newWeights[i]).to.be.at.closeTo(
              currentWeights[i],
              DEVIATION,
            );
          }
        });
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
        await vault.enableTradingWithWeights(
          valueArray(ONE.div(tokens.length), tokens.length),
        );

        expect(await vault.isSwapEnabled()).to.equal(true);

        expect(await vault.estimateGas.disableTrading()).to.below(48000);
        await vault.connect(manager).disableTrading();

        expect(await vault.isSwapEnabled()).to.equal(false);
      });
    });

    describe("Set Swap Fee", () => {
      const maxFeeDelta = toWei(0.0005);

      describe("should be reverted to set swap fee", async () => {
        it("when called from non-manager", async () => {
          await expect(vault.setSwapFee(toWei(3))).to.be.revertedWith(
            "Mammon__CallerIsNotManager()",
          );
        });

        it("when swap fee is greater than balancer maximum", async () => {
          const maxFee = toWei(0.1);
          let newFee = await vault.getSwapFee();
          while (newFee.lte(maxFee)) {
            await vault.connect(manager).setSwapFee(newFee);
            newFee = newFee.add(maxFeeDelta);
          }
          await expect(
            vault.connect(manager).setSwapFee(maxFee.add(1)),
          ).to.be.revertedWith(BALANCER_ERRORS.MAX_SWAP_FEE_PERCENTAGE);
        });

        it("when swap fee is less than balancer minimum", async () => {
          const minFee = toWei(0.000001);
          let newFee = await vault.getSwapFee();
          while (newFee.gte(minFee)) {
            await vault.connect(manager).setSwapFee(newFee);
            newFee = newFee.sub(maxFeeDelta);
          }
          await expect(
            vault.connect(manager).setSwapFee(minFee.sub(1)),
          ).to.be.revertedWith(BALANCER_ERRORS.MIN_SWAP_FEE_PERCENTAGE);
        });
      });

      it("should be possible to set swap fee", async () => {
        const fee = await vault.getSwapFee();
        const newFee = fee.add(maxFeeDelta);
        expect(
          await vault.connect(manager).estimateGas.setSwapFee(newFee),
        ).to.below(50000);
        await vault.connect(manager).setSwapFee(newFee);

        expect(await vault.getSwapFee()).to.equal(newFee);
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
