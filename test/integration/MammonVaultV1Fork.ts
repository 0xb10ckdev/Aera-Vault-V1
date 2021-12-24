import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import hre, { deployments, ethers } from "hardhat";
import {
  IERC20,
  MammonPoolFactoryV1,
  MammonPoolFactoryV1__factory,
  MammonVaultV1Mainnet,
  MammonVaultV1Mainnet__factory,
  WithdrawalValidatorMock,
  WithdrawalValidatorMock__factory,
} from "../../typechain";
import { setupTokens, deployToken } from "../fixtures";
import { deployFactory, deployVault, toWei, valueArray } from "../utils";
import { DEFAULT_NOTICE_PERIOD } from "../../scripts/config";
import {
  ONE,
  MIN_WEIGHT,
  MIN_SWAP_FEE,
  MAX_SWAP_FEE,
  ZERO_ADDRESS,
  NOTICE_PERIOD,
  MAX_NOTICE_PERIOD,
  BALANCER_ERRORS,
} from "../constants";

describe("Mammon Vault V1 Mainnet Deployment", function () {
  let admin: SignerWithAddress;
  let manager: SignerWithAddress;
  let validator: WithdrawalValidatorMock;
  let factory: MammonPoolFactoryV1;
  let tokens: IERC20[];
  let sortedTokens: string[];
  let unsortedTokens: string[];
  let snapshot: unknown;
  let validWeights: string[];

  describe("should be reverted to deploy vault", async () => {
    before(async function () {
      snapshot = await ethers.provider.send("evm_snapshot", []);
      ({ admin, manager } = await ethers.getNamedSigners());

      ({ tokens, sortedTokens, unsortedTokens } = await setupTokens());
      validWeights = valueArray(ONE.div(tokens.length), tokens.length);

      await deployments.deploy("Validator", {
        contract: "WithdrawalValidatorMock",
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

    after(async () => {
      await ethers.provider.send("evm_revert", [snapshot]);
    });

    it("when token and weight length is not same", async () => {
      await expect(
        deployVault(
          admin,
          factory.address,
          "Test",
          "TEST",
          [...sortedTokens, tokens[0].address],
          validWeights,
          MIN_SWAP_FEE.toString(),
          ONE.toString(),
          manager.address,
        ),
      ).to.be.revertedWith("Mammon__WeightLengthIsNotSame");
    });

    it("when notice period is greater than maximum", async () => {
      await expect(
        deployVault(
          admin,
          factory.address,
          "Test",
          "TEST",
          sortedTokens,
          validWeights,
          MIN_SWAP_FEE.toString(),
          ONE.toString(),
          manager.address,
          validator.address,
          MAX_NOTICE_PERIOD + 1,
        ),
      ).to.be.revertedWith("Mammon__NoticePeriodIsAboveMax");
    });

    it("when validator is not valid", async () => {
      await expect(
        deployVault(
          admin,
          factory.address,
          "Test",
          "TEST",
          sortedTokens,
          validWeights,
          MIN_SWAP_FEE.toString(),
          ONE.toString(),
          manager.address,
          manager.address,
        ),
      ).to.be.revertedWith("Mammon__ValidatorIsNotValid");
      await expect(
        deployVault(
          admin,
          factory.address,
          "Test",
          "TEST",
          sortedTokens,
          validWeights,
          MIN_SWAP_FEE.toString(),
          ONE.toString(),
          manager.address,
          (
            await deployments.get("InvalidValidator")
          ).address,
        ),
      ).to.be.revertedWith("Mammon__ValidatorIsNotValid");
    });

    it("when token is not sorted in ascending order", async () => {
      await expect(
        deployVault(
          admin,
          factory.address,
          "Test",
          "TEST",
          unsortedTokens,
          validWeights,
          MIN_SWAP_FEE.toString(),
          ONE.toString(),
          manager.address,
          validator.address,
        ),
      ).to.be.revertedWith(BALANCER_ERRORS.UNSORTED_ARRAY);
    });

    it("when swap fee is greater than maximum", async () => {
      await expect(
        deployVault(
          admin,
          factory.address,
          "Test",
          "TEST",
          sortedTokens,
          validWeights,
          MAX_SWAP_FEE.add(1).toString(),
          ONE.toString(),
          manager.address,
          validator.address,
        ),
      ).to.be.revertedWith(BALANCER_ERRORS.MAX_SWAP_FEE_PERCENTAGE);
    });

    it("when swap fee is less than minimum", async () => {
      await expect(
        deployVault(
          admin,
          factory.address,
          "Test",
          "TEST",
          sortedTokens,
          validWeights,
          MIN_SWAP_FEE.sub(1).toString(),
          ONE.toString(),
          manager.address,
          validator.address,
        ),
      ).to.be.revertedWith(BALANCER_ERRORS.MIN_SWAP_FEE_PERCENTAGE);
    });

    it("when total sum of weight is not one", async () => {
      await expect(
        deployVault(
          admin,
          factory.address,
          "Test",
          "TEST",
          sortedTokens,
          valueArray(MIN_WEIGHT, tokens.length),
          MIN_SWAP_FEE.toString(),
          ONE.toString(),
          manager.address,
          validator.address,
        ),
      ).to.be.revertedWith(BALANCER_ERRORS.NORMALIZED_WEIGHT_INVARIANT);
    });

    it("when management swap fee is greater than maximum", async () => {
      await expect(
        deployVault(
          admin,
          factory.address,
          "Test",
          "TEST",
          sortedTokens,
          validWeights,
          MIN_SWAP_FEE.toString(),
          ONE.add(1).toString(),
          manager.address,
          validator.address,
        ),
      ).to.be.revertedWith(BALANCER_ERRORS.MAX_MANAGEMENT_SWAP_FEE_PERCENTAGE);
    });
  });
});

describe("Mammon Vault V1 Mainnet Functionality", function () {
  let admin: SignerWithAddress;
  let manager: SignerWithAddress;
  let user: SignerWithAddress;
  let vault: MammonVaultV1Mainnet;
  let validator: WithdrawalValidatorMock;
  let factory: MammonPoolFactoryV1;
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

    validator = await validatorMock.connect(admin).deploy();

    await hre.run("deploy:factory", {
      silent: true,
    });
    factory = MammonPoolFactoryV1__factory.connect(
      (await deployments.get("MammonPoolFactoryV1")).address,
      admin,
    );

    const validWeights = valueArray(ONE.div(tokens.length), tokens.length);
    await hre.run("deploy:vault", {
      factory: factory.address,
      name: "Test",
      symbol: "TEST",
      tokens: sortedTokens.join(","),
      weights: validWeights.join(","),
      swapFee: MIN_SWAP_FEE.toString(),
      managementSwapFee: ONE.toString(),
      manager: manager.address,
      validator: validator.address,
      noticePeriod: DEFAULT_NOTICE_PERIOD.toString(),
      silent: true,
    });

    vault = MammonVaultV1Mainnet__factory.connect(
      (await deployments.get("MammonVaultV1Mainnet")).address,
      admin,
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
              MIN_WEIGHT,
              MIN_WEIGHT,
              blocknumber + 1,
              blocknumber + 1000,
            ),
        ).to.be.revertedWith("Mammon__VaultNotInitialized");
      });

      it("when call initializeFinalization", async () => {
        await expect(vault.initializeFinalization()).to.be.revertedWith(
          "Mammon__VaultNotInitialized",
        );
      });

      it("when call setPublicSwap", async () => {
        await expect(
          vault.connect(manager).setPublicSwap(true),
        ).to.be.revertedWith("VaultNotInitialized");
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
      const balances = await getBalances();

      await vault.initialDeposit(valueArray(ONE, tokens.length));

      const { holdings, balances: newBalances } = await getState();
      for (let i = 0; i < tokens.length; i++) {
        expect(newBalances[i]).to.equal(balances[i].sub(ONE));
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
        it("when deposit one token", async () => {
          let { holdings, balances } = await getState();
          for (let i = 0; i < tokens.length; i++) {
            const amounts = tokens.map((_, index) =>
              index == i ? toWei(5) : toWei(0),
            );

            await vault.deposit(amounts);

            const { holdings: newHoldings, balances: newBalances } =
              await getState();
            for (let j = 0; j < tokens.length; j++) {
              expect(newHoldings[j]).to.equal(holdings[j].add(amounts[j]));
              expect(newBalances[j]).to.equal(balances[j].sub(amounts[j]));
            }

            holdings = newHoldings;
            balances = newBalances;
          }
        });

        it("when deposit tokens", async () => {
          const { holdings, balances } = await getState();

          const amounts = tokens.map(_ =>
            toWei(Math.floor(Math.random() * 100000)),
          );
          for (let i = 0; i < tokens.length; i++) {
            await tokens[i].approve(vault.address, amounts[i]);
          }

          await vault.deposit(amounts);

          const { holdings: newHoldings, balances: newBalances } =
            await getState();
          for (let i = 0; i < tokens.length; i++) {
            expect(newHoldings[i]).to.equal(holdings[i].add(amounts[i]));
            expect(newBalances[i]).to.equal(balances[i].sub(amounts[i]));
          }
        });
      });
    });

    describe("when withdrawing to Vault", () => {
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

        it("when amount exceeds balance in pool", async () => {
          await expect(
            vault.withdraw(valueArray(toWei(100), tokens.length)),
          ).to.be.revertedWith(BALANCER_ERRORS.SUB_OVERFLOW);
        });
      });

      describe("should be possible to withdraw ", async () => {
        it("when withdraw one token", async () => {
          await vault.deposit(valueArray(toWei(5), tokens.length));
          let { holdings, balances } = await getState();

          for (let i = 0; i < tokens.length; i++) {
            const amounts = tokens.map((_, index) =>
              index == i ? toWei(5) : toWei(0),
            );

            await vault.withdraw(amounts);

            const { holdings: newHoldings, balances: newBalances } =
              await getState();
            for (let j = 0; j < tokens.length; j++) {
              expect(newHoldings[j]).to.equal(holdings[j].sub(amounts[j]));
              expect(newBalances[j]).to.equal(balances[j].add(amounts[j]));
            }

            holdings = newHoldings;
            balances = newBalances;
          }
        });

        it("when withdraw tokens", async () => {
          for (let i = 0; i < tokens.length; i++) {
            await tokens[i].approve(vault.address, toWei(100000));
          }
          await vault.deposit(valueArray(toWei(100000), tokens.length));

          const { holdings, balances } = await getState();

          const amounts = tokens.map(_ =>
            toWei(Math.floor(Math.random() * 100000)),
          );
          for (let i = 0; i < tokens.length; i++) {
            await tokens[i].approve(vault.address, amounts[i]);
          }

          await vault.withdraw(amounts);

          const { holdings: newHoldings, balances: newBalances } =
            await getState();
          for (let i = 0; i < tokens.length; i++) {
            expect(newHoldings[i]).to.equal(holdings[i].sub(amounts[i]));
            expect(newBalances[i]).to.equal(balances[i].add(amounts[i]));
          }
        });
      });
    });

    describe("when finalizing", () => {
      describe("should be reverted to call initializeFinalization", async () => {
        it("when called from non-owner", async () => {
          await expect(
            vault.connect(manager).initializeFinalization(),
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });
      });

      describe("should be reverted to call finalize", async () => {
        it("when called from non-owner and non-manager", async () => {
          await expect(vault.connect(user).finalize()).to.be.revertedWith(
            "Mammon__CallerIsNotOwnerOrManager",
          );
        });

        it("when finalization is not initialized", async () => {
          await expect(vault.finalize()).to.be.revertedWith(
            "Mammon__FinalizationNotInitialized",
          );
        });

        it("when noticeTimeout is not elapsed", async () => {
          await vault.initializeFinalization();
          const noticeTimeoutAt = await vault.noticeTimeoutAt();

          await expect(vault.finalize()).to.be.revertedWith(
            `Mammon__NoticeTimeoutNotElapsed(${noticeTimeoutAt})`,
          );
        });
      });

      describe("should be reverted to call functions when finalizing", async () => {
        beforeEach(async () => {
          await vault.initializeFinalization();
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
                MIN_WEIGHT,
                MIN_WEIGHT,
                blocknumber + 1,
                blocknumber + 1000,
              ),
          ).to.be.revertedWith("Mammon__VaultIsFinalizing");
        });

        it("when call pokeWeights", async () => {
          await expect(
            vault.connect(manager).pokeWeights(),
          ).to.be.revertedWith("Mammon__VaultIsFinalizing");
        });

        it("when call initializeFinalization", async () => {
          await expect(vault.initializeFinalization()).to.be.revertedWith(
            "Mammon__VaultIsFinalizing",
          );
        });
      });

      it("should be possible to finalize", async () => {
        await vault.initializeFinalization();
        await ethers.provider.send("evm_increaseTime", [NOTICE_PERIOD + 1]);

        const { holdings, balances } = await getState();

        await vault.finalize();

        const newBalances = await getBalances();

        for (let i = 0; i < tokens.length; i++) {
          expect(newBalances[i]).to.equal(balances[i].add(holdings[i]));
        }

        expect(await ethers.provider.getCode(vault.address)).to.equal("0x");
      });
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
        expect(await vault.estimateGas.setManager(manager.address)).to.below(
          35000,
        );
        await vault.setManager(manager.address);

        expect(await vault.manager()).to.equal(manager.address);
      });
    });
  });
});
