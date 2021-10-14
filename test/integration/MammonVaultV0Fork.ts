import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import hre, { deployments, ethers } from "hardhat";
import {
  IBPoolMock,
  IBPoolMock__factory,
  IERC20,
  MammonVaultV0,
  MammonVaultV0__factory,
  WithdrawalValidatorMock,
  WithdrawalValidatorMock__factory,
} from "../../typechain";
import { setupTokens } from "../fixtures";
import { toWei } from "../utils";

const ONE_TOKEN = toWei("1");
const MIN_WEIGHT = toWei("1");
const MAX_WEIGHT = toWei("50");
const MIN_BALANCE = toWei("1").div(1e12);
const ZERO_ADDRESS = ethers.constants.AddressZero;

describe("Mammon Vault v0", function () {
  let admin: SignerWithAddress;
  let manager: SignerWithAddress;
  let user: SignerWithAddress;
  let bPool: IBPoolMock;
  let vault: MammonVaultV0;
  let validator: WithdrawalValidatorMock;
  let DAI: IERC20;
  let WETH: IERC20;
  let snapshot: unknown;

  const NOTICE_PERIOD = 10000;

  const getStates = async () => {
    const weight0 = await vault.getDenormalizedWeight(DAI.address);
    const weight1 = await vault.getDenormalizedWeight(WETH.address);
    const holdings0 = await vault.holdings0();
    const holdings1 = await vault.holdings1();
    const balance0 = await DAI.balanceOf(admin.address);
    const balance1 = await WETH.balanceOf(admin.address);
    const spotPrice = await bPool.getSpotPrice(DAI.address, WETH.address);

    return {
      weight0,
      weight1,
      holdings0,
      holdings1,
      balance0,
      balance1,
      spotPrice,
    };
  };

  beforeEach(async function () {
    snapshot = await ethers.provider.send("evm_snapshot", []);
    ({ admin, manager, user } = await ethers.getNamedSigners());

    ({ DAI, WETH } = await setupTokens());

    await deployments.deploy("Validator", {
      contract: "WithdrawalValidatorMock",
      from: admin.address,
      log: true,
    });

    await hre.run("deploy:vault", {
      token0: DAI.address,
      token1: WETH.address,
      manager: manager.address,
      validator: (await deployments.get("Validator")).address,
      noticePeriod: NOTICE_PERIOD,
    });

    vault = MammonVaultV0__factory.connect(
      (await deployments.get("MammonVaultV0")).address,
      admin,
    );
    bPool = IBPoolMock__factory.connect(await vault.pool(), admin);
    validator = WithdrawalValidatorMock__factory.connect(
      (await deployments.get("Validator")).address,
      admin,
    );
  });

  afterEach(async () => {
    await ethers.provider.send("evm_revert", [snapshot]);
  });

  describe("when Vault not initialized", () => {
    beforeEach(async () => {
      await DAI.approve(vault.address, ONE_TOKEN);
      await WETH.approve(vault.address, ONE_TOKEN);
    });

    it("should be reverted to call functions", async () => {
      await expect(vault.deposit(ONE_TOKEN, ONE_TOKEN)).to.be.revertedWith(
        "VaultNotInitialized",
      );

      await expect(vault.withdraw(ONE_TOKEN, ONE_TOKEN)).to.be.revertedWith(
        "VaultNotInitialized",
      );

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
      ).to.be.revertedWith("VaultNotInitialized");

      await expect(vault.connect(manager).pokeWeights()).to.be.revertedWith(
        "VaultNotInitialized",
      );

      await expect(vault.initializeFinalization()).to.be.revertedWith(
        "VaultNotInitialized",
      );

      await expect(
        vault.connect(manager).setPublicSwap(true),
      ).to.be.revertedWith("VaultNotInitialized");
    });

    it("should be reverted to initialize the vault", async () => {
      await expect(
        vault.initialDeposit(
          ONE_TOKEN,
          ONE_TOKEN,
          MIN_WEIGHT,
          MIN_WEIGHT.sub(1),
        ),
      ).to.be.revertedWith("WeightIsBelowMin");

      await expect(
        vault.initialDeposit(
          ONE_TOKEN,
          ONE_TOKEN,
          MIN_WEIGHT.sub(1),
          MIN_WEIGHT,
        ),
      ).to.be.revertedWith("WeightIsBelowMin");

      await expect(
        vault.initialDeposit(
          ONE_TOKEN,
          ONE_TOKEN,
          MAX_WEIGHT,
          MAX_WEIGHT.add(1),
        ),
      ).to.be.revertedWith("WeightIsAboveMax");

      await expect(
        vault.initialDeposit(
          ONE_TOKEN,
          ONE_TOKEN,
          MAX_WEIGHT.add(1),
          MAX_WEIGHT,
        ),
      ).to.be.revertedWith("WeightIsAboveMax");

      await expect(
        vault.initialDeposit(
          MIN_BALANCE.sub(1),
          MIN_BALANCE,
          MIN_WEIGHT,
          MIN_WEIGHT,
        ),
      ).to.be.revertedWith("AmountIsBelowMin");

      await expect(
        vault.initialDeposit(
          MIN_BALANCE,
          MIN_BALANCE.sub(1),
          MIN_WEIGHT,
          MIN_WEIGHT,
        ),
      ).to.be.revertedWith("AmountIsBelowMin");
    });

    it("should be possible to initialize the vault", async () => {
      expect(
        await vault.estimateGas.initialDeposit(
          ONE_TOKEN,
          ONE_TOKEN,
          MIN_WEIGHT,
          MIN_WEIGHT,
        ),
      ).to.below(610000);
      await vault.initialDeposit(ONE_TOKEN, ONE_TOKEN, MIN_WEIGHT, MIN_WEIGHT);

      expect(await vault.holdings0()).to.equal(ONE_TOKEN);
      expect(await vault.holdings1()).to.equal(ONE_TOKEN);
      expect(await vault.getDenormalizedWeight(DAI.address)).to.equal(
        MIN_WEIGHT,
      );
      expect(await vault.getDenormalizedWeight(WETH.address)).to.equal(
        MIN_WEIGHT,
      );
    });

    it("should be reverted to initialize the vault again", async () => {
      await vault.initialDeposit(ONE_TOKEN, ONE_TOKEN, MIN_WEIGHT, MIN_WEIGHT);

      await expect(
        vault.initialDeposit(ONE_TOKEN, ONE_TOKEN, MIN_WEIGHT, MIN_WEIGHT),
      ).to.be.revertedWith("VaultIsAlreadyInitialized()");
    });
  });

  describe("when Vault is initialized", () => {
    beforeEach(async () => {
      await DAI.approve(vault.address, toWei(100));
      await WETH.approve(vault.address, toWei(100));
      await vault.initialDeposit(ONE_TOKEN, ONE_TOKEN, MIN_WEIGHT, MIN_WEIGHT);
    });

    describe("when depositing to Vault", () => {
      it("should be reverted to deposit tokens", async () => {
        await expect(vault.deposit(toWei(0), toWei(100))).to.be.revertedWith(
          "ERC20: transfer amount exceeds allowance",
        );

        await expect(vault.deposit(toWei(100), toWei(0))).to.be.revertedWith(
          "ERC20: transfer amount exceeds allowance",
        );

        await expect(vault.deposit(toWei(50), toWei(20))).to.be.revertedWith(
          "ERR_MAX_WEIGHT",
        );

        await expect(vault.deposit(toWei(10), toWei(80))).to.be.revertedWith(
          "ERR_MAX_WEIGHT",
        );

        await expect(vault.deposit(toWei(20), toWei(40))).to.be.revertedWith(
          "ERR_MAX_TOTAL_WEIGHT",
        );
      });

      it("should be possible to deposit token0", async () => {
        const {
          weight0,
          weight1,
          holdings0,
          holdings1,
          balance0,
          balance1,
          spotPrice,
        } = await getStates();

        expect(await vault.estimateGas.deposit(toWei(5), toWei(0))).to.below(
          180000,
        );
        await vault.deposit(toWei(5), toWei(0));

        const newHoldings0 = holdings0.add(toWei(5));
        const newWeight0 = weight0.mul(newHoldings0).div(holdings0);

        expect(await vault.holdings0()).to.equal(newHoldings0);
        expect(await vault.holdings1()).to.equal(holdings1);
        expect(await vault.getDenormalizedWeight(DAI.address)).to.equal(
          newWeight0,
        );
        expect(await vault.getDenormalizedWeight(WETH.address)).to.equal(
          weight1,
        );
        expect(await DAI.balanceOf(admin.address)).to.equal(
          balance0.sub(toWei(5)),
        );
        expect(await WETH.balanceOf(admin.address)).to.equal(balance1);
        expect(await bPool.getSpotPrice(DAI.address, WETH.address)).to.equal(
          spotPrice,
        );
      });

      it("should be possible to deposit token1", async () => {
        const {
          weight0,
          weight1,
          holdings0,
          holdings1,
          balance0,
          balance1,
          spotPrice,
        } = await getStates();

        expect(await vault.estimateGas.deposit(toWei(0), toWei(5))).to.below(
          180000,
        );
        await vault.deposit(toWei(0), toWei(5));

        const newHoldings1 = holdings1.add(toWei(5));
        const newWeight1 = weight1.mul(newHoldings1).div(holdings1);

        expect(await vault.holdings0()).to.equal(holdings0);
        expect(await vault.holdings1()).to.equal(newHoldings1);
        expect(await vault.getDenormalizedWeight(DAI.address)).to.equal(
          weight0,
        );
        expect(await vault.getDenormalizedWeight(WETH.address)).to.equal(
          newWeight1,
        );
        expect(await DAI.balanceOf(admin.address)).to.equal(balance0);
        expect(await WETH.balanceOf(admin.address)).to.equal(
          balance1.sub(toWei(5)),
        );
        expect(await bPool.getSpotPrice(DAI.address, WETH.address)).to.equal(
          spotPrice,
        );
      });

      it("should be possible to deposit tokens", async () => {
        const {
          weight0,
          weight1,
          holdings0,
          holdings1,
          balance0,
          balance1,
          spotPrice,
        } = await getStates();

        expect(await vault.estimateGas.deposit(toWei(5), toWei(15))).to.below(
          300000,
        );
        await vault.deposit(toWei(5), toWei(15));

        const newHoldings0 = holdings0.add(toWei(5));
        const newHoldings1 = holdings1.add(toWei(15));
        const newWeight0 = weight0.mul(newHoldings0).div(holdings0);
        const newWeight1 = weight1.mul(newHoldings1).div(holdings1);

        expect(await vault.holdings0()).to.equal(newHoldings0);
        expect(await vault.holdings1()).to.equal(newHoldings1);
        expect(await vault.getDenormalizedWeight(DAI.address)).to.equal(
          newWeight0,
        );
        expect(await vault.getDenormalizedWeight(WETH.address)).to.equal(
          newWeight1,
        );
        expect(await DAI.balanceOf(admin.address)).to.equal(
          balance0.sub(toWei(5)),
        );
        expect(await WETH.balanceOf(admin.address)).to.equal(
          balance1.sub(toWei(15)),
        );
        expect(await bPool.getSpotPrice(DAI.address, WETH.address)).to.equal(
          spotPrice,
        );
      });
    });

    describe("when withdrawing from Vault", () => {
      describe("when allowance on validator is invalid", () => {
        it("should withdraw no tokens", async () => {
          const {
            weight0,
            weight1,
            holdings0,
            holdings1,
            balance0,
            balance1,
            spotPrice,
          } = await getStates();

          await vault.withdraw(toWei(5), toWei(15));

          expect(await vault.holdings0()).to.equal(holdings0);
          expect(await vault.holdings1()).to.equal(holdings1);
          expect(await vault.getDenormalizedWeight(DAI.address)).to.equal(
            weight0,
          );
          expect(await vault.getDenormalizedWeight(WETH.address)).to.equal(
            weight1,
          );
          expect(await DAI.balanceOf(admin.address)).to.equal(balance0);
          expect(await WETH.balanceOf(admin.address)).to.equal(balance1);
          expect(await bPool.getSpotPrice(DAI.address, WETH.address)).to.equal(
            spotPrice,
          );
        });
      });

      describe("when allowance on validator is valid", () => {
        beforeEach(async () => {
          await vault.deposit(toWei(10), toWei(20));
          await validator.setAllowance(toWei(100), toWei(100));
        });

        it("should be reverted to withdraw tokens", async () => {
          await expect(vault.withdraw(toWei(0), toWei(60))).to.be.revertedWith(
            "ERR_MIN_WEIGHT",
          );

          await expect(vault.withdraw(toWei(11), toWei(0))).to.be.revertedWith(
            "ERR_MIN_WEIGHT",
          );

          await expect(
            vault.withdraw(toWei(11), toWei(20)),
          ).to.be.revertedWith("ERR_MIN_WEIGHT");
        });

        it("should be possible to withdraw token0", async () => {
          const {
            weight0,
            weight1,
            holdings0,
            holdings1,
            balance0,
            balance1,
            spotPrice,
          } = await getStates();

          expect(
            await vault.estimateGas.withdraw(toWei(5), toWei(0)),
          ).to.below(160000);
          await vault.withdraw(toWei(5), toWei(0));

          const newHoldings0 = holdings0.sub(toWei(5));
          const newWeight0 = weight0.mul(newHoldings0).div(holdings0);

          expect(await vault.holdings0()).to.equal(newHoldings0);
          expect(await vault.holdings1()).to.equal(holdings1);
          expect(await vault.getDenormalizedWeight(DAI.address)).to.equal(
            newWeight0,
          );
          expect(await vault.getDenormalizedWeight(WETH.address)).to.equal(
            weight1,
          );
          expect(await DAI.balanceOf(admin.address)).to.equal(
            balance0.add(toWei(5)),
          );
          expect(await WETH.balanceOf(admin.address)).to.equal(
            balance1.add(toWei(0)),
          );
          expect(await bPool.getSpotPrice(DAI.address, WETH.address)).to.equal(
            spotPrice,
          );
        });

        it("should be possible to withdraw token1", async () => {
          const {
            weight0,
            weight1,
            holdings0,
            holdings1,
            balance0,
            balance1,
            spotPrice,
          } = await getStates();

          expect(
            await vault.estimateGas.withdraw(toWei(0), toWei(5)),
          ).to.below(160000);
          await vault.withdraw(toWei(0), toWei(5));

          const newHoldings1 = holdings1.sub(toWei(5));
          const newWeight1 = weight1.mul(newHoldings1).div(holdings1);

          expect(await vault.holdings0()).to.equal(holdings0);
          expect(await vault.holdings1()).to.equal(newHoldings1);
          expect(await vault.getDenormalizedWeight(DAI.address)).to.equal(
            weight0,
          );
          expect(await vault.getDenormalizedWeight(WETH.address)).to.equal(
            newWeight1,
          );
          expect(await DAI.balanceOf(admin.address)).to.equal(
            balance0.add(toWei(0)),
          );
          expect(await WETH.balanceOf(admin.address)).to.equal(
            balance1.add(toWei(5)),
          );
          expect(await bPool.getSpotPrice(DAI.address, WETH.address)).to.equal(
            spotPrice,
          );
        });

        it("should be possible to withdraw tokens", async () => {
          const {
            weight0,
            weight1,
            holdings0,
            holdings1,
            balance0,
            balance1,
            spotPrice,
          } = await getStates();

          expect(
            await vault.estimateGas.withdraw(toWei(5), toWei(10)),
          ).to.below(240000);
          await vault.withdraw(toWei(5), toWei(10));

          const newHoldings0 = holdings0.sub(toWei(5));
          const newHoldings1 = holdings1.sub(toWei(10));
          const newWeight0 = weight0.mul(newHoldings0).div(holdings0);
          const newWeight1 = weight1.mul(newHoldings1).div(holdings1);

          expect(await vault.holdings0()).to.equal(newHoldings0);
          expect(await vault.holdings1()).to.equal(newHoldings1);
          expect(await vault.getDenormalizedWeight(DAI.address)).to.equal(
            newWeight0,
          );
          expect(await vault.getDenormalizedWeight(WETH.address)).to.equal(
            newWeight1,
          );
          expect(await DAI.balanceOf(admin.address)).to.equal(
            balance0.add(toWei(5)),
          );
          expect(await WETH.balanceOf(admin.address)).to.equal(
            balance1.add(toWei(10)),
          );
          expect(await bPool.getSpotPrice(DAI.address, WETH.address)).to.equal(
            spotPrice,
          );
        });
      });
    });

    describe("when calling updateWeightsGradually()", () => {
      it("should be reverted to call updateWeightsGradually", async () => {
        await expect(
          vault.updateWeightsGradually(toWei(2), toWei(3), 0, 0),
        ).to.be.revertedWith("CallerIsNotManager");

        await expect(
          vault
            .connect(manager)
            .updateWeightsGradually(toWei(2), toWei(3), 0, 0),
        ).to.be.revertedWith("ERR_GRADUAL_UPDATE_TIME_TRAVEL");

        const blocknumber = await ethers.provider.getBlockNumber();
        await expect(
          vault
            .connect(manager)
            .updateWeightsGradually(
              toWei(2),
              toWei(51),
              blocknumber + 1,
              blocknumber + 1000,
            ),
        ).to.be.revertedWith("ERR_WEIGHT_ABOVE_MAX");

        await expect(
          vault
            .connect(manager)
            .updateWeightsGradually(
              toWei(0.1),
              toWei(3),
              blocknumber + 1,
              blocknumber + 1000,
            ),
        ).to.be.revertedWith("ERR_WEIGHT_BELOW_MIN");
      });

      it("should be possible to call updateWeightsGradually", async () => {
        const blockNumber = await ethers.provider.getBlockNumber();
        expect(
          await vault
            .connect(manager)
            .estimateGas.updateWeightsGradually(
              toWei(2),
              toWei(3),
              blockNumber + 1,
              blockNumber + 10001,
            ),
        ).to.below(200000);
        await vault
          .connect(manager)
          .updateWeightsGradually(
            toWei(2),
            toWei(3),
            blockNumber + 1,
            blockNumber + 10001,
          );
      });
    });

    describe("when calling pokeWeights()", () => {
      let startBlock: number;
      beforeEach(async () => {
        const blockNumber = await ethers.provider.getBlockNumber();
        startBlock = blockNumber + 1;

        await vault
          .connect(manager)
          .updateWeightsGradually(
            toWei(2),
            toWei(3),
            blockNumber + 1,
            blockNumber + 10001,
          );
      });

      it("should be reverted to call pokeWeights()", async () => {
        await expect(vault.pokeWeights()).to.be.revertedWith(
          "CallerIsNotManager",
        );
      });

      it("should be possible to call pokeWeight", async () => {
        for (let i = 0; i < 1000; i += 1) {
          await ethers.provider.send("evm_mine", []);
        }

        const weight0 = await vault.getDenormalizedWeight(DAI.address);
        const weight1 = await vault.getDenormalizedWeight(WETH.address);

        expect(
          await vault.connect(manager).estimateGas.pokeWeights(),
        ).to.below(120000);
        await vault.connect(manager).pokeWeights();

        const blockNumber = await ethers.provider.getBlockNumber();
        const deltaBlock = blockNumber - startBlock;
        const newWeight0 = weight0.add(
          toWei(2).sub(weight0).mul(deltaBlock).div(10000),
        );
        const newWeight1 = weight1.add(
          toWei(3).sub(weight1).mul(deltaBlock).div(10000),
        );

        expect(await vault.getDenormalizedWeight(DAI.address)).to.equal(
          newWeight0,
        );
        expect(await vault.getDenormalizedWeight(WETH.address)).to.equal(
          newWeight1,
        );
      });
    });

    describe("when finalizing", () => {
      it("should be reverted to call finalize", async () => {
        await expect(vault.connect(user).finalize()).to.be.revertedWith(
          "CallerIsNotOwnerOrManager",
        );
        await expect(vault.finalize()).to.be.revertedWith(
          "FinalizationNotInitialized",
        );
        await expect(
          vault.connect(manager).initializeFinalization(),
        ).to.be.revertedWith("Ownable: caller is not the owner");

        expect(await vault.estimateGas.initializeFinalization()).to.below(
          32000,
        );
        await vault.initializeFinalization();
        const noticeTimeoutAt = await vault.noticeTimeoutAt();

        await expect(vault.finalize()).to.be.revertedWith(
          `NoticeTimeoutNotElapsed(${noticeTimeoutAt})`,
        );
      });

      it("should be reverted to call functions when finalizing", async () => {
        await vault.initializeFinalization();

        await expect(vault.deposit(ONE_TOKEN, ONE_TOKEN)).to.be.revertedWith(
          "VaultIsFinalizing",
        );

        await expect(vault.withdraw(ONE_TOKEN, ONE_TOKEN)).to.be.revertedWith(
          "VaultIsFinalizing",
        );

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
        ).to.be.revertedWith("VaultIsFinalizing");

        await expect(vault.connect(manager).pokeWeights()).to.be.revertedWith(
          "VaultIsFinalizing",
        );

        await expect(vault.initializeFinalization()).to.be.revertedWith(
          "VaultIsFinalizing",
        );
      });

      it("should be possible to finalize", async () => {
        await vault.initializeFinalization();
        await ethers.provider.send("evm_increaseTime", [NOTICE_PERIOD + 1]);

        const holdings0 = await vault.holdings0();
        const holdings1 = await vault.holdings1();
        const balance0 = await DAI.balanceOf(admin.address);
        const balance1 = await WETH.balanceOf(admin.address);

        expect(await vault.estimateGas.finalize()).to.below(250000);
        await vault.finalize();

        expect(await DAI.balanceOf(admin.address)).to.equal(
          balance0.add(holdings0),
        );
        expect(await WETH.balanceOf(admin.address)).to.equal(
          balance1.add(holdings1),
        );

        expect(await ethers.provider.getCode(vault.address)).to.equal("0x");
      });
    });
  });

  describe("Update Elements", () => {
    describe("Update Manager", () => {
      it("should be reverted to change manager", async () => {
        await expect(vault.setManager(ZERO_ADDRESS)).to.be.revertedWith(
          "ManagerIsZeroAddress",
        );

        await expect(
          vault.connect(manager).setManager(ZERO_ADDRESS),
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should be possible to change manager", async () => {
        expect(await vault.estimateGas.setManager(manager.address)).to.below(
          35000,
        );
        await vault.setManager(manager.address);

        expect(await vault.manager()).to.equal(manager.address);
      });
    });

    describe("Set Public Swap", () => {
      beforeEach(async () => {
        await DAI.approve(vault.address, ONE_TOKEN);
        await WETH.approve(vault.address, ONE_TOKEN);
        await vault.initialDeposit(
          ONE_TOKEN,
          ONE_TOKEN,
          MIN_WEIGHT,
          MIN_WEIGHT,
        );
      });

      it("should be reverted to set public swap", async () => {
        await expect(vault.setPublicSwap(true)).to.be.revertedWith(
          "CallerIsNotManager()",
        );
      });

      it("should be possible to set public swap", async () => {
        expect(
          await vault.connect(manager).estimateGas.setPublicSwap(true),
        ).to.below(46000);
        await vault.connect(manager).setPublicSwap(true);

        expect(await vault.isPublicSwap()).to.equal(true);
      });
    });

    describe("Set Swap Fee", () => {
      it("should be reverted to set swap fee", async () => {
        await expect(vault.setSwapFee(toWei(3))).to.be.revertedWith(
          "CallerIsNotManager()",
        );

        await expect(
          vault.connect(manager).setSwapFee(toWei(0.3)),
        ).to.be.revertedWith("ERR_MAX_FEE");

        await expect(
          vault.connect(manager).setSwapFee(toWei(1).div(1e7)),
        ).to.be.revertedWith("ERR_MIN_FEE");
      });

      it("should be possible to set swap fee", async () => {
        expect(
          await vault.connect(manager).estimateGas.setSwapFee(toWei(0.01)),
        ).to.below(50000);
        await vault.connect(manager).setSwapFee(toWei(0.01));

        expect(await vault.getSwapFee()).to.equal(toWei(0.01));
      });
    });
  });
});
