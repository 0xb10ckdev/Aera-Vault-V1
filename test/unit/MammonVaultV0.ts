import { ethers, waffle, artifacts } from "hardhat";
import { BigNumber } from "ethers";
import { Artifact } from "hardhat/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import { toWei } from "../utils";
import {
  PermissiveWithdrawalValidator,
  BFactoryMock,
  ERC20Mock,
  MammonVaultV0,
} from "../../typechain";

const { deployContract } = waffle;

const ONE_TOKEN = toWei("1");
const MIN_WEIGHT = toWei("1");
const MAX_WEIGHT = toWei("50");
const MIN_BALANCE = toWei("1").div(1e12);
const ZERO_ADDRESS = ethers.constants.AddressZero;

describe("Mammon Vault v0", function () {
  let validator: PermissiveWithdrawalValidator;
  let bFactory: BFactoryMock;
  let admin: SignerWithAddress;
  let manager: SignerWithAddress;
  let user: SignerWithAddress;
  let vault: MammonVaultV0;
  let DAI: ERC20Mock;
  let WETH: ERC20Mock;
  let snapshot: unknown;

  const NOTICE_PERIOD = 10000;

  let weight0: BigNumber;
  let weight1: BigNumber;
  let holdings0: BigNumber;
  let holdings1: BigNumber;
  let balance0: BigNumber;
  let balance1: BigNumber;

  const storeStates = async () => {
    weight0 = await vault.getDenormalizedWeight(DAI.address);
    weight1 = await vault.getDenormalizedWeight(WETH.address);
    holdings0 = await vault.holdings0();
    holdings1 = await vault.holdings1();
    balance0 = await DAI.balanceOf(admin.address);
    balance1 = await WETH.balanceOf(admin.address);
  };

  beforeEach(async function () {
    snapshot = await ethers.provider.send("evm_snapshot", []);
    [admin, manager, user] = await ethers.getSigners();

    const validatorArtifact: Artifact = await artifacts.readArtifact(
      "PermissiveWithdrawalValidator",
    );
    validator = <PermissiveWithdrawalValidator>(
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
        "WETH",
        "WETH.address",
        18,
        toWei(1000),
      ])
    );
    WETH = <ERC20Mock>(
      await deployContract(admin, erc20MockArtifact, [
        "DAI",
        "DAI.address",
        18,
        toWei(1000),
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
      ).to.be.revertedWith("VaultIsAlreadyInitialized()");
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
          await storeStates();
          await DAI.approve(vault.address, toWei(5));
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
        }
      });

      it("should be possible to deposit token1", async () => {
        for (let i = 0; i < 10; i += 1) {
          await storeStates();
          await WETH.approve(vault.address, toWei(5));
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
        }
      });

      it("should be possible to deposit tokens", async () => {
        for (let i = 0; i < 10; i += 1) {
          await storeStates();
          await DAI.approve(vault.address, toWei(5));
          await WETH.approve(vault.address, toWei(10));
          await vault.deposit(toWei(5), toWei(10));

          const newHoldings0 = holdings0.add(toWei(5));
          const newHoldings1 = holdings1.add(toWei(10));
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
            balance1.sub(toWei(10)),
          );
        }
      });
    });

    describe("when withdrawing from Vault", () => {
      beforeEach(async () => {
        await DAI.approve(vault.address, toWei(100));
        await WETH.approve(vault.address, toWei(100));
        await vault.deposit(toWei(50), toWei(100));
      });

      it("should be revert to withdraw tokens", async () => {
        await expect(
          vault.connect(manager).withdraw(toWei(5), toWei(10)),
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should be possible to withdraw token0", async () => {
        for (let i = 0; i < 10; i += 1) {
          await storeStates();
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
        }
      });

      it("should be possible to withdraw token1", async () => {
        for (let i = 0; i < 10; i += 1) {
          await storeStates();
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
        }
      });

      it("should be possible to withdraw tokens", async () => {
        for (let i = 0; i < 10; i += 1) {
          await storeStates();
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
        }
      });
    });

    describe("when calling updateWeightsGradually()", () => {
      it("should be reverted to call updateWeightsGradually", async () => {
        await expect(
          vault.updateWeightsGradually(toWei(2), toWei(3), 0, 0),
        ).to.be.revertedWith("CallerIsNotManager()");
      });

      it("should be possible to call updateWeightsGradually", async () => {
        await vault
          .connect(manager)
          .updateWeightsGradually(toWei(2), toWei(3), 0, 0);
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
          "CallerIsNotManager()",
        );
      });

      it("should be possible to call pokeWeight", async () => {
        await vault.connect(manager).pokeWeights();
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
        await vault.finalize();

        expect(await DAI.balanceOf(admin.address)).to.equal(toWei(1000));
        expect(await WETH.balanceOf(admin.address)).to.equal(toWei(1000));
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
          vault.connect(manager).setManager(user.address),
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should be possible to change manager", async () => {
        await vault.setManager(user.address);
        expect(await vault.manager()).to.equal(user.address);
      });
    });

    describe("Set Public Swap", () => {
      it("should be reverted to set public swap", async () => {
        await expect(vault.setPublicSwap(true)).to.be.revertedWith(
          "CallerIsNotManager()",
        );
      });

      it("should be possible to set public swap", async () => {
        await vault.connect(manager).setPublicSwap(true);
        expect(await vault.isPublicSwap()).to.equal(true);
      });
    });

    describe("Set Swap Fee", () => {
      it("should be reverted to set swap fee", async () => {
        await expect(vault.setSwapFee(toWei(3))).to.be.revertedWith(
          "CallerIsNotManager()",
        );
      });

      it("should be possible to set swap fee", async () => {
        await vault.connect(manager).setSwapFee(toWei(0.01));
        expect(await vault.getSwapFee()).to.equal(toWei(0.01));
      });
    });
  });
});
