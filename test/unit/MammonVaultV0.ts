import { ethers, waffle, artifacts } from "hardhat";
import { BigNumber } from "ethers";
import { Artifact } from "hardhat/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import { toWei } from "../utils";
import { ONE_TOKEN } from "../constants";
import {
  WithdrawalValidatorMock,
  BFactoryMock,
  ERC20Mock,
  MammonVaultV0,
} from "../../typechain";

const { deployContract } = waffle;

const MIN_WEIGHT = toWei("1");
const MAX_WEIGHT = toWei("50");
const MIN_BALANCE = toWei("1").div(1e12);
const ZERO_ADDRESS = ethers.constants.AddressZero;

describe("Mammon Vault v0", function () {
  let validator: WithdrawalValidatorMock;
  let bFactory: BFactoryMock;
  let admin: SignerWithAddress;
  let manager: SignerWithAddress;
  let user: SignerWithAddress;
  let vault: MammonVaultV0;
  let DAI: ERC20Mock;
  let WETH: ERC20Mock;
  let snapshot: unknown;

  const NOTICE_PERIOD = 10000;
  const MAX_NOTICE_PERIOD = 5184000; // 60 days in seconds

  const testAmounts = [
    [1, 10],
    [5, 5],
    [20, 50],
    [50, 1000],
    [100, 35],
    [1000, 100],
    [88964, 4346],
    [27891, 637],
    [2865, 13788],
    [77568, 37812],
    [4566543, 889778],
  ];

  const getStates = async () => {
    const weight0 = await vault.getDenormalizedWeight(DAI.address);
    const weight1 = await vault.getDenormalizedWeight(WETH.address);
    const holdings0 = await vault.holdings0();
    const holdings1 = await vault.holdings1();
    const balance0 = await DAI.balanceOf(admin.address);
    const balance1 = await WETH.balanceOf(admin.address);
    const [allowance0, allowance1] = await validator.allowance();

    return {
      weight0,
      weight1,
      holdings0,
      holdings1,
      balance0,
      balance1,
      allowance0,
      allowance1,
    };
  };

  const getWeightsChangeRatio = (
    weight0: BigNumber,
    weight1: BigNumber,
    targetWeight0: BigNumber,
    targetWeight1: BigNumber,
  ) => {
    const factor0 = weight0.mul(targetWeight1);
    const factor1 = targetWeight0.mul(weight1);
    const change = factor0.gt(factor1)
      ? factor0.mul(toWei(1)).div(factor1)
      : factor1.mul(toWei(1)).div(factor0);

    return change;
  };

  beforeEach(async function () {
    snapshot = await ethers.provider.send("evm_snapshot", []);
    [admin, manager, user] = await ethers.getSigners();

    const validatorArtifact: Artifact = await artifacts.readArtifact(
      "WithdrawalValidatorMock",
    );
    validator = <WithdrawalValidatorMock>(
      await deployContract(admin, validatorArtifact)
    );

    const bFactoryArtifact: Artifact = await artifacts.readArtifact(
      "BFactoryMock",
    );
    bFactory = <BFactoryMock>await deployContract(admin, bFactoryArtifact);

    const erc20MockArtifact: Artifact = await artifacts.readArtifact(
      "ERC20Mock",
    );
    DAI = <ERC20Mock>(
      await deployContract(admin, erc20MockArtifact, [
        "Wether",
        "WETH",
        18,
        toWei(10000000),
      ])
    );
    WETH = <ERC20Mock>(
      await deployContract(admin, erc20MockArtifact, [
        "Dai",
        "DAI",
        18,
        toWei(10000000),
      ])
    );

    const SmartPoolManager = await ethers.getContractFactory(
      "SmartPoolManager",
    );
    const smartPoolManager = await SmartPoolManager.connect(admin).deploy();
    const VaultFactory = await ethers.getContractFactory("MammonVaultV0", {
      libraries: {
        "contracts/libraries/SmartPoolManager.sol:SmartPoolManager":
          smartPoolManager.address,
      },
    });

    await expect(
      VaultFactory.connect(admin).deploy(
        bFactory.address,
        DAI.address,
        DAI.address,
        manager.address,
        validator.address,
        NOTICE_PERIOD,
      ),
    ).to.be.revertedWith("Mammon__SameTokenAddresses");
    await expect(
      VaultFactory.connect(admin).deploy(
        bFactory.address,
        DAI.address,
        WETH.address,
        manager.address,
        manager.address,
        NOTICE_PERIOD,
      ),
    ).to.be.revertedWith("Mammon__ValidatorIsNotValid");
    await expect(
      VaultFactory.connect(admin).deploy(
        bFactory.address,
        DAI.address,
        WETH.address,
        manager.address,
        validator.address,
        MAX_NOTICE_PERIOD + 1,
      ),
    ).to.be.revertedWith("NoticePeriodIsAboveMax");

    vault = <MammonVaultV0>(
      await VaultFactory.connect(admin).deploy(
        bFactory.address,
        DAI.address,
        WETH.address,
        manager.address,
        validator.address,
        NOTICE_PERIOD,
      )
    );
  });

  afterEach(async () => {
    await ethers.provider.send("evm_revert", [snapshot]);
  });

  describe("when Vault is not initialized", () => {
    beforeEach(async () => {
      await DAI.approve(vault.address, ONE_TOKEN);
      await WETH.approve(vault.address, ONE_TOKEN);
    });

    it("should be reverted to call functions", async () => {
      await expect(vault.deposit(ONE_TOKEN, ONE_TOKEN)).to.be.revertedWith(
        "Mammon__VaultNotInitialized",
      );

      await expect(vault.withdraw(ONE_TOKEN, ONE_TOKEN)).to.be.revertedWith(
        "Mammon__VaultNotInitialized",
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
      ).to.be.revertedWith("Mammon__VaultNotInitialized");

      await expect(vault.connect(manager).pokeWeights()).to.be.revertedWith(
        "Mammon__VaultNotInitialized",
      );

      await expect(vault.initializeFinalization()).to.be.revertedWith(
        "Mammon__VaultNotInitialized",
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
      ).to.be.revertedWith("Mammon__VaultIsAlreadyInitialized()");
    });
  });

  describe("when Vault is initialized", () => {
    beforeEach(async () => {
      await DAI.approve(vault.address, toWei(100));
      await WETH.approve(vault.address, toWei(100));
      await vault.initialDeposit(ONE_TOKEN, ONE_TOKEN, MIN_WEIGHT, MIN_WEIGHT);
    });

    describe("when depositing to vault", () => {
      it("should be reverted to deposit tokens", async () => {
        await expect(vault.deposit(toWei(0), toWei(100))).to.be.revertedWith(
          "ERC20: transfer amount exceeds allowance",
        );

        await expect(vault.deposit(toWei(100), toWei(0))).to.be.revertedWith(
          "ERC20: transfer amount exceeds allowance",
        );
      });

      it("should be possible to deposit token0", async () => {
        for (let i = 0; i < 10; i += 1) {
          const {
            weight0,
            weight1,
            holdings0,
            holdings1,
            balance0,
            balance1,
          } = await getStates();

          const amount0 = toWei(testAmounts[i][0]);
          const amount1 = toWei(0);

          await DAI.approve(vault.address, amount0);
          await vault.deposit(amount0, amount1);

          const newHoldings0 = holdings0.add(amount0);
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
            balance0.sub(amount0),
          );
          expect(await WETH.balanceOf(admin.address)).to.equal(balance1);

          expect(await vault.getWeightsChangeRatio(weight0, weight1)).to.equal(
            getWeightsChangeRatio(newWeight0, weight1, weight0, weight1),
          );
        }
      });

      it("should be possible to deposit token1", async () => {
        for (let i = 0; i < 10; i += 1) {
          const {
            weight0,
            weight1,
            holdings0,
            holdings1,
            balance0,
            balance1,
          } = await getStates();

          const amount0 = toWei(0);
          const amount1 = toWei(testAmounts[i][1]);

          await WETH.approve(vault.address, amount1);
          await vault.deposit(amount0, amount1);

          const newHoldings1 = holdings1.add(amount1);
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
            balance1.sub(amount1),
          );

          expect(await vault.getWeightsChangeRatio(weight0, weight1)).to.equal(
            getWeightsChangeRatio(weight0, newWeight1, weight0, weight1),
          );
        }
      });

      it("should be possible to deposit tokens", async () => {
        for (let i = 0; i < 10; i += 1) {
          const {
            weight0,
            weight1,
            holdings0,
            holdings1,
            balance0,
            balance1,
          } = await getStates();

          const amount0 = toWei(testAmounts[i][0]);
          const amount1 = toWei(testAmounts[i][1]);

          await DAI.approve(vault.address, amount0);
          await WETH.approve(vault.address, amount1);
          await vault.deposit(amount0, amount1);

          const newHoldings0 = holdings0.add(amount0);
          const newHoldings1 = holdings1.add(amount1);
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
            balance0.sub(amount0),
          );
          expect(await WETH.balanceOf(admin.address)).to.equal(
            balance1.sub(amount1),
          );

          expect(await vault.getWeightsChangeRatio(weight0, weight1)).to.equal(
            getWeightsChangeRatio(newWeight0, newWeight1, weight0, weight1),
          );
        }
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
            allowance0,
            allowance1,
          } = await getStates();

          await expect(vault.withdraw(toWei(5), toWei(15)))
            .to.emit(vault, "Withdraw")
            .withArgs(
              toWei(5),
              toWei(15),
              toWei(0),
              toWei(0),
              allowance0,
              allowance1,
              weight0,
              weight1,
            );

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
        });
      });

      describe("when allowance on validator is valid", () => {
        beforeEach(async () => {
          await DAI.approve(vault.address, toWei(1000000));
          await WETH.approve(vault.address, toWei(1000000));
          await vault.deposit(toWei(1000000), toWei(1000000));
          await validator.setAllowance(toWei(1000000), toWei(1000000));
        });

        it("should withdraw only allowed tokens", async () => {
          await validator.setAllowance(toWei(3), toWei(5));
          const {
            weight0,
            weight1,
            holdings0,
            holdings1,
            balance0,
            balance1,
            allowance0,
            allowance1,
          } = await getStates();

          const amount0 = toWei(5);
          const amount1 = toWei(15);

          const newHoldings0 = holdings0.sub(allowance0);
          const newHoldings1 = holdings1.sub(allowance1);
          const newWeight0 = weight0.mul(newHoldings0).div(holdings0);
          const newWeight1 = weight1.mul(newHoldings1).div(holdings1);

          await expect(vault.withdraw(amount0, amount1))
            .to.emit(vault, "Withdraw")
            .withArgs(
              amount0,
              amount1,
              allowance0,
              allowance1,
              allowance0,
              allowance1,
              newWeight0,
              newWeight1,
            );

          expect(await vault.holdings0()).to.equal(newHoldings0);
          expect(await vault.holdings1()).to.equal(newHoldings1);
          expect(await vault.getDenormalizedWeight(DAI.address)).to.equal(
            newWeight0,
          );
          expect(await vault.getDenormalizedWeight(WETH.address)).to.equal(
            newWeight1,
          );
          expect(await DAI.balanceOf(admin.address)).to.equal(
            balance0.add(allowance0),
          );
          expect(await WETH.balanceOf(admin.address)).to.equal(
            balance1.add(allowance1),
          );
        });

        it("should be revert to withdraw tokens", async () => {
          await expect(
            vault.connect(manager).withdraw(toWei(5), toWei(10)),
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("should be possible to withdraw token0", async () => {
          for (let i = 0; i < 10; i += 1) {
            const {
              weight0,
              weight1,
              holdings0,
              holdings1,
              balance0,
              balance1,
              allowance0,
              allowance1,
            } = await getStates();

            const amount0 = toWei(testAmounts[i][0]);
            const amount1 = toWei(0);

            const newHoldings0 = holdings0.sub(amount0);
            const newWeight0 = weight0.mul(newHoldings0).div(holdings0);

            await expect(vault.withdraw(amount0, amount1))
              .to.emit(vault, "Withdraw")
              .withArgs(
                amount0,
                amount1,
                amount0,
                amount1,
                allowance0,
                allowance1,
                newWeight0,
                weight1,
              );

            expect(await vault.holdings0()).to.equal(newHoldings0);
            expect(await vault.holdings1()).to.equal(holdings1);
            expect(await vault.getDenormalizedWeight(DAI.address)).to.equal(
              newWeight0,
            );
            expect(await vault.getDenormalizedWeight(WETH.address)).to.equal(
              weight1,
            );
            expect(await DAI.balanceOf(admin.address)).to.equal(
              balance0.add(amount0),
            );
            expect(await WETH.balanceOf(admin.address)).to.equal(balance1);

            expect(
              await vault.getWeightsChangeRatio(weight0, weight1),
            ).to.equal(
              getWeightsChangeRatio(newWeight0, weight1, weight0, weight1),
            );
          }
        });

        it("should be possible to withdraw token1", async () => {
          for (let i = 0; i < 10; i += 1) {
            const {
              weight0,
              weight1,
              holdings0,
              holdings1,
              balance0,
              balance1,
              allowance0,
              allowance1,
            } = await getStates();

            const amount0 = toWei(0);
            const amount1 = toWei(testAmounts[i][1]);

            const newHoldings1 = holdings1.sub(amount1);
            const newWeight1 = weight1.mul(newHoldings1).div(holdings1);

            await expect(vault.withdraw(amount0, amount1))
              .to.emit(vault, "Withdraw")
              .withArgs(
                amount0,
                amount1,
                amount0,
                amount1,
                allowance0,
                allowance1,
                weight0,
                newWeight1,
              );

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
              balance1.add(amount1),
            );

            expect(
              await vault.getWeightsChangeRatio(weight0, weight1),
            ).to.equal(
              getWeightsChangeRatio(weight0, newWeight1, weight0, weight1),
            );
          }
        });

        it("should be possible to withdraw tokens", async () => {
          for (let i = 0; i < 10; i += 1) {
            const {
              weight0,
              weight1,
              holdings0,
              holdings1,
              balance0,
              balance1,
              allowance0,
              allowance1,
            } = await getStates();

            const amount0 = toWei(testAmounts[i][0]);
            const amount1 = toWei(testAmounts[i][1]);

            const newHoldings0 = holdings0.sub(amount0);
            const newHoldings1 = holdings1.sub(amount1);
            const newWeight0 = weight0.mul(newHoldings0).div(holdings0);
            const newWeight1 = weight1.mul(newHoldings1).div(holdings1);

            await expect(vault.withdraw(amount0, amount1))
              .to.emit(vault, "Withdraw")
              .withArgs(
                amount0,
                amount1,
                amount0,
                amount1,
                allowance0,
                allowance1,
                newWeight0,
                newWeight1,
              );

            expect(await vault.holdings0()).to.equal(newHoldings0);
            expect(await vault.holdings1()).to.equal(newHoldings1);
            expect(await vault.getDenormalizedWeight(DAI.address)).to.equal(
              newWeight0,
            );
            expect(await vault.getDenormalizedWeight(WETH.address)).to.equal(
              newWeight1,
            );
            expect(await DAI.balanceOf(admin.address)).to.equal(
              balance0.add(amount0),
            );
            expect(await WETH.balanceOf(admin.address)).to.equal(
              balance1.add(amount1),
            );

            expect(
              await vault.getWeightsChangeRatio(weight0, weight1),
            ).to.equal(
              getWeightsChangeRatio(newWeight0, newWeight1, weight0, weight1),
            );
          }
        });
      });
    });

    describe("when gradualUpdate has been set", () => {
      it("should be possible to read gradualUpdate", async () => {
        const gradualUpdate = await vault.gradualUpdate();

        expect(gradualUpdate.startBlock).to.equal(0);
        expect(gradualUpdate.endBlock).to.equal(0);
      });
    });

    describe("when calling updateWeightsGradually()", () => {
      it("should be reverted to call updateWeightsGradually", async () => {
        await expect(
          vault.updateWeightsGradually(toWei(2), toWei(3), 0, 1),
        ).to.be.revertedWith("Mammon__CallerIsNotManager()");

        await expect(
          vault
            .connect(manager)
            .updateWeightsGradually(toWei(2), toWei(3), 3, 3),
        ).to.be.revertedWith("reverted with panic code 0x12");

        await expect(
          vault
            .connect(manager)
            .updateWeightsGradually(toWei(2), toWei(3), 3, 2),
        ).to.be.revertedWith("reverted with panic code 0x11");

        await expect(
          vault
            .connect(manager)
            .updateWeightsGradually(toWei(2), toWei(50), 0, 10),
        ).to.be.revertedWith("Mammon__RatioChangePerBlockIsAboveMax");

        await expect(
          vault
            .connect(manager)
            .updateWeightsGradually(toWei(50), toWei(2), 0, 10),
        ).to.be.revertedWith("Mammon__RatioChangePerBlockIsAboveMax");
      });

      it("should be possible to call updateWeightsGradually", async () => {
        await expect(
          vault
            .connect(manager)
            .updateWeightsGradually(toWei(2), toWei(3), 0, 1000),
        )
          .to.emit(vault, "UpdateWeightsGradually")
          .withArgs(toWei(2), toWei(3), 0, 1000);
      });
    });

    describe("when calling pokeWeights()", () => {
      beforeEach(async () => {
        const blockNumber = await ethers.provider.getBlockNumber();

        await vault
          .connect(manager)
          .updateWeightsGradually(
            toWei(2),
            toWei(3),
            blockNumber + 1,
            blockNumber + 10001,
          );
      });

      it("should be reverted to call pokeWeight", async () => {
        await expect(vault.pokeWeights()).to.be.revertedWith(
          "Mammon__CallerIsNotManager()",
        );
      });

      it("should be possible to call pokeWeight", async () => {
        await expect(vault.connect(manager).pokeWeights()).to.emit(
          vault,
          "PokeWeights",
        );
      });
    });

    describe("when finalizing", () => {
      it("should be reverted to call finalize", async () => {
        await expect(vault.connect(user).finalize()).to.be.revertedWith(
          "Mammon__CallerIsNotOwnerOrManager",
        );
        await expect(vault.finalize()).to.be.revertedWith(
          "Mammon__FinalizationNotInitialized",
        );
        await expect(
          vault.connect(manager).initializeFinalization(),
        ).to.be.revertedWith("Ownable: caller is not the owner");

        await vault.initializeFinalization();
        const noticeTimeoutAt = await vault.noticeTimeoutAt();

        await expect(vault.finalize()).to.be.revertedWith(
          `Mammon__NoticeTimeoutNotElapsed(${noticeTimeoutAt})`,
        );
      });

      it("should be reverted to call functions when finalizing", async () => {
        await vault.initializeFinalization();

        await expect(vault.deposit(ONE_TOKEN, ONE_TOKEN)).to.be.revertedWith(
          "Mammon__VaultIsFinalizing",
        );

        await expect(vault.withdraw(ONE_TOKEN, ONE_TOKEN)).to.be.revertedWith(
          "Mammon__VaultIsFinalizing",
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
        ).to.be.revertedWith("Mammon__VaultIsFinalizing");

        await expect(vault.connect(manager).pokeWeights()).to.be.revertedWith(
          "Mammon__VaultIsFinalizing",
        );

        await expect(vault.initializeFinalization()).to.be.revertedWith(
          "Mammon__VaultIsFinalizing",
        );
      });

      it("should be possible to finalize", async () => {
        const { holdings0, holdings1 } = await getStates();

        await vault.initializeFinalization();
        await ethers.provider.send("evm_increaseTime", [NOTICE_PERIOD + 1]);

        await expect(vault.finalize())
          .to.emit(vault, "Finalized")
          .withArgs(admin.address, holdings0, holdings1);

        expect(await DAI.balanceOf(admin.address)).to.equal(toWei(10000000));
        expect(await WETH.balanceOf(admin.address)).to.equal(toWei(10000000));

        expect(await ethers.provider.getCode(vault.address)).to.equal("0x");
      });
    });
  });

  describe("Sweep", () => {
    let TOKEN: ERC20Mock;
    beforeEach(async () => {
      const erc20MockArtifact: Artifact = await artifacts.readArtifact(
        "ERC20Mock",
      );
      TOKEN = <ERC20Mock>(
        await deployContract(admin, erc20MockArtifact, [
          "TOKEN Test",
          "TTOKEN",
          18,
          toWei(10000000),
        ])
      );
    });

    it("should be reverted to withdraw token", async () => {
      await TOKEN.transfer(vault.address, toWei(1000));
      await expect(
        vault.connect(manager).sweep(TOKEN.address, toWei(1001)),
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(vault.sweep(TOKEN.address, toWei(1001))).to.be.revertedWith(
        "ERC20: transfer amount exceeds balance",
      );
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
      it("should be reverted to change manager", async () => {
        await expect(vault.setManager(ZERO_ADDRESS)).to.be.revertedWith(
          "Mammon__ManagerIsZeroAddress",
        );

        await expect(
          vault.connect(manager).setManager(user.address),
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should be possible to change manager", async () => {
        await vault.setManager(user.address);
        expect(await vault.manager()).to.equal(user.address);
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
          "Mammon__CallerIsNotManager()",
        );
      });

      it("should be possible to set public swap", async () => {
        await expect(vault.connect(manager).setPublicSwap(true)).emit(
          vault,
          "SetPublicSwap",
        );
        expect(await vault.isPublicSwap()).to.equal(true);
      });
    });

    describe("Set Swap Fee", () => {
      it("should be reverted to set swap fee", async () => {
        await expect(vault.setSwapFee(toWei(3))).to.be.revertedWith(
          "Mammon__CallerIsNotManager()",
        );
      });

      it("should be possible to set swap fee", async () => {
        await expect(vault.connect(manager).setSwapFee(toWei(0.01))).emit(
          vault,
          "SetSwapFee",
        );
        expect(await vault.getSwapFee()).to.equal(toWei(0.01));
      });
    });
  });
});
