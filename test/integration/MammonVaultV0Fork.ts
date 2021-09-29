import { ethers, deployments } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { deployVault, toWei } from "../utils";
import {
  IERC20,
  IERC20__factory,
  MammonVaultV0,
  IBPoolMock,
  IBPoolMock__factory,
} from "../../typechain";

const ONE_TOKEN = toWei("1");
const MIN_WEIGHT = toWei("1");
const MAX_WEIGHT = toWei("50");
const MIN_BALANCE = toWei("1").div(1e12);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

describe("Mammon Vault v0", function () {
  let signers: SignerWithAddress[];
  let admin: Signer;
  let manager: Signer;
  let user1: Signer;
  let bPool: IBPoolMock;
  let vault: MammonVaultV0;
  let dai: IERC20;
  let weth: IERC20;

  let ADMIN: string, MANAGER: string;
  let DAI: string, WETH: string;
  let VAULT: string;

  let startBlock: number;

  const NOTICE_PERIOD = 10000;

  before(async function () {
    signers = await ethers.getSigners();
    admin = await ethers.getNamedSigner("admin");
    manager = await ethers.getNamedSigner("manager");
    user1 = signers[2];
    ADMIN = await admin.getAddress();
    MANAGER = await manager.getAddress();

    await deployments.fixture();
  });

  before(async function () {
    dai = IERC20__factory.connect(
      (await deployments.get("DAI")).address,
      admin,
    );
    weth = IERC20__factory.connect(
      (await deployments.get("WETH")).address,
      admin,
    );

    DAI = dai.address;
    WETH = weth.address;

    vault = await deployVault(admin, DAI, WETH, MANAGER);

    VAULT = vault.address;
    bPool = IBPoolMock__factory.connect(await vault.pool(), admin);
  });

  describe("Vault initialization", () => {
    it("should be reverted to initialize the vault", async () => {
      await dai.approve(VAULT, ONE_TOKEN);
      await weth.approve(VAULT, ONE_TOKEN);

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
      ).to.below(600000);
      await vault.initialDeposit(ONE_TOKEN, ONE_TOKEN, MIN_WEIGHT, MIN_WEIGHT);

      expect(await vault.holdings0()).to.equal(ONE_TOKEN);
      expect(await vault.holdings1()).to.equal(ONE_TOKEN);
      expect(await vault.getDenormalizedWeight(DAI)).to.equal(MIN_WEIGHT);
      expect(await vault.getDenormalizedWeight(WETH)).to.equal(MIN_WEIGHT);
    });

    it("should be reverted to initialize the vault again", async () => {
      await expect(
        vault.initialDeposit(ONE_TOKEN, ONE_TOKEN, MIN_WEIGHT, MIN_WEIGHT),
      ).to.be.revertedWith("VaultIsAlreadyInitialized()");
    });
  });

  describe("Vault Deposit", () => {
    it("should be reverted to deposit tokens", async () => {
      await dai.approve(VAULT, toWei(50));
      await weth.approve(VAULT, toWei(20));

      await expect(vault.deposit(toWei(50), toWei(20))).to.be.revertedWith(
        "ERR_MAX_WEIGHT",
      );
    });

    it("should be possible to deposit tokens", async () => {
      const weight0 = await vault.getDenormalizedWeight(DAI);
      const weight1 = await vault.getDenormalizedWeight(WETH);
      const holdings0 = await vault.holdings0();
      const holdings1 = await vault.holdings1();
      const balance0 = await dai.balanceOf(ADMIN);
      const balance1 = await weth.balanceOf(ADMIN);
      const spotPrice = await bPool.getSpotPrice(DAI, WETH);

      expect(await vault.estimateGas.deposit(toWei(10), toWei(20))).to.below(
        300000,
      );
      await vault.deposit(toWei(10), toWei(20));

      const newHoldings0 = holdings0.add(toWei(10));
      const newHoldings1 = holdings1.add(toWei(20));
      const newWeight0 = weight0.mul(newHoldings0).div(holdings0);
      const newWeight1 = weight1.mul(newHoldings1).div(holdings1);

      expect(await vault.holdings0()).to.equal(newHoldings0);
      expect(await vault.holdings1()).to.equal(newHoldings1);
      expect(await vault.getDenormalizedWeight(DAI)).to.equal(newWeight0);
      expect(await vault.getDenormalizedWeight(WETH)).to.equal(newWeight1);
      expect(await dai.balanceOf(ADMIN)).to.equal(balance0.sub(toWei(10)));
      expect(await weth.balanceOf(ADMIN)).to.equal(balance1.sub(toWei(20)));
      expect(await bPool.getSpotPrice(DAI, WETH)).to.equal(spotPrice);
    });
  });

  describe("Vault Withdraw", () => {
    it("should be reverted to withdraw tokens", async () => {
      await expect(vault.withdraw(toWei(11), toWei(20))).to.be.revertedWith(
        "ERR_MIN_WEIGHT",
      );
    });

    it("should be possible to withdraw tokens", async () => {
      const weight0 = await vault.getDenormalizedWeight(DAI);
      const weight1 = await vault.getDenormalizedWeight(WETH);
      const holdings0 = await vault.holdings0();
      const holdings1 = await vault.holdings1();
      const balance0 = await dai.balanceOf(ADMIN);
      const balance1 = await weth.balanceOf(ADMIN);
      const spotPrice = await bPool.getSpotPrice(DAI, WETH);

      expect(await vault.estimateGas.withdraw(toWei(5), toWei(10))).to.below(
        250000,
      );
      await vault.withdraw(toWei(5), toWei(10));

      const newHoldings0 = holdings0.sub(toWei(5));
      const newHoldings1 = holdings1.sub(toWei(10));
      const newWeight0 = weight0.mul(newHoldings0).div(holdings0);
      const newWeight1 = weight1.mul(newHoldings1).div(holdings1);

      expect(await vault.holdings0()).to.equal(newHoldings0);
      expect(await vault.holdings1()).to.equal(newHoldings1);
      expect(await vault.getDenormalizedWeight(DAI)).to.equal(newWeight0);
      expect(await vault.getDenormalizedWeight(WETH)).to.equal(newWeight1);
      expect(await dai.balanceOf(ADMIN)).to.equal(balance0.add(toWei(5)));
      expect(await weth.balanceOf(ADMIN)).to.equal(balance1.add(toWei(10)));
      expect(await bPool.getSpotPrice(DAI, WETH)).to.equal(spotPrice);
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
        expect(await vault.estimateGas.setManager(MANAGER)).to.below(35000);
        await vault.setManager(MANAGER);

        expect(await vault.manager()).to.equal(MANAGER);
      });
    });

    describe("Set Public Swap", () => {
      it("should be reverted to set public swap", async () => {
        await expect(vault.setPublicSwap(true)).to.be.revertedWith(
          "CallerIsNotManager()",
        );
      });

      it("should be possible to set public swap", async () => {
        expect(
          await vault.connect(manager).estimateGas.setPublicSwap(true),
        ).to.below(45000);
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

  describe("Update Weights Gradually", () => {
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
      const blocknumber = await ethers.provider.getBlockNumber();
      startBlock = blocknumber + 1;

      expect(
        await vault
          .connect(manager)
          .estimateGas.updateWeightsGradually(
            toWei(2),
            toWei(3),
            blocknumber + 1,
            blocknumber + 10001,
          ),
      ).to.below(200000);
      await vault
        .connect(manager)
        .updateWeightsGradually(
          toWei(2),
          toWei(3),
          blocknumber + 1,
          blocknumber + 10001,
        );
    });
  });

  describe("Poke Weights", () => {
    it("should be reverted to call pokeWeight", async () => {
      await expect(vault.pokeWeights()).to.be.revertedWith(
        "CallerIsNotManager",
      );
    });

    it("should be possible to call pokeWeight", async () => {
      for (let i = 0; i < 1000; i += 1) {
        await ethers.provider.send("evm_mine", []);
      }

      const weight0 = await vault.getDenormalizedWeight(DAI);
      const weight1 = await vault.getDenormalizedWeight(WETH);

      expect(await vault.connect(manager).estimateGas.pokeWeights()).to.below(
        120000,
      );
      await vault.connect(manager).pokeWeights();

      const blocknumber = await ethers.provider.getBlockNumber();
      const deltaBlock = blocknumber - startBlock;
      const newWeight0 = weight0.add(
        toWei(2).sub(weight0).mul(deltaBlock).div(10000),
      );
      const newWeight1 = weight1.add(
        toWei(3).sub(weight1).mul(deltaBlock).div(10000),
      );

      expect(await vault.getDenormalizedWeight(DAI)).to.equal(newWeight0);
      expect(await vault.getDenormalizedWeight(WETH)).to.equal(newWeight1);
    });
  });

  describe("Finalize", () => {
    it("should be reverted to call finalize", async () => {
      await expect(vault.connect(user1).finalize()).to.be.revertedWith(
        "CallerIsNotOwnerOrManager",
      );
      await expect(vault.finalize()).to.be.revertedWith(
        "FinalizationNotInitialized",
      );
      await expect(
        vault.connect(manager).initializeFinalization(),
      ).to.be.revertedWith("Ownable: caller is not the owner");

      expect(await vault.estimateGas.initializeFinalization()).to.below(30000);
      await vault.initializeFinalization();
      const noticeTimeoutAt = await vault.noticeTimeoutAt();

      await expect(vault.finalize()).to.be.revertedWith(
        `NoticeTimeoutNotElapsed(${noticeTimeoutAt})`,
      );
    });

    it("should be possible to finalize", async () => {
      await ethers.provider.send("evm_increaseTime", [NOTICE_PERIOD + 1]);

      const holdings0 = await vault.holdings0();
      const holdings1 = await vault.holdings1();
      const balance0 = await dai.balanceOf(ADMIN);
      const balance1 = await weth.balanceOf(ADMIN);

      expect(await vault.estimateGas.finalize()).to.below(220000);
      await vault.finalize();

      expect(await dai.balanceOf(ADMIN)).to.equal(balance0.add(holdings0));
      expect(await weth.balanceOf(ADMIN)).to.equal(balance1.add(holdings1));
    });
  });
});
