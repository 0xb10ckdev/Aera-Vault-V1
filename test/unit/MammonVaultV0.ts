import { ethers, waffle, artifacts } from "hardhat";
import { Artifact } from "hardhat/types";
import { Signer } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import { toWei } from "../utils";
import {
  PermissiveWithdrawalValidator,
  BFactoryMock,
  ERC20Mock,
  MammonVaultV0,
  BPoolMock__factory,
} from "../../typechain";

const { deployContract } = waffle;

const ONE_TOKEN = toWei("1");
const MIN_WEIGHT = toWei("1");
const MAX_WEIGHT = toWei("50");
const MIN_BALANCE = toWei("1").div(1e12);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

describe("Mammon Vault v0", function () {
  let signers: SignerWithAddress[];
  let validator: PermissiveWithdrawalValidator;
  let bFactory: BFactoryMock;
  let admin: Signer;
  let manager: Signer;
  let user1: Signer;
  let vault: MammonVaultV0;
  let dai: ERC20Mock;
  let weth: ERC20Mock;

  let ADMIN: string, MANAGER: string, USER1: string;
  let DAI: string, WETH: string;
  let VAULT: string;

  const NOTICE_PERIOD = 10000;

  before(async function () {
    signers = await ethers.getSigners();
    admin = signers[0];
    manager = signers[1];
    user1 = signers[2];
    ADMIN = await admin.getAddress();
    MANAGER = await manager.getAddress();
    USER1 = await user1.getAddress();

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
    dai = <ERC20Mock>(
      await deployContract(admin, erc20MockArtifact, [
        "weth",
        "WETH",
        18,
        toWei(1000),
      ])
    );
    weth = <ERC20Mock>(
      await deployContract(admin, erc20MockArtifact, [
        "dai",
        "DAI",
        18,
        toWei(1000),
      ])
    );

    DAI = dai.address;
    WETH = weth.address;
  });

  describe("Vault Initialization", () => {
    it("vault should be deployed", async () => {
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
          dai.address,
          weth.address,
          USER1,
          validator.address,
          NOTICE_PERIOD,
        )
      );
      VAULT = vault.address;
    });

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
    it("should be possible to deposit tokens", async () => {
      const weight0 = await vault.getDenormalizedWeight(DAI);
      const weight1 = await vault.getDenormalizedWeight(WETH);
      const holdings0 = await vault.holdings0();
      const holdings1 = await vault.holdings1();
      const balance0 = await dai.balanceOf(ADMIN);
      const balance1 = await weth.balanceOf(ADMIN);

      await dai.approve(VAULT, toWei(10));
      await weth.approve(VAULT, toWei(20));

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
    });
  });

  describe("Vault Withdraw", () => {
    it("should be possible to withdraw tokens", async () => {
      const weight0 = await vault.getDenormalizedWeight(DAI);
      const weight1 = await vault.getDenormalizedWeight(WETH);
      const holdings0 = await vault.holdings0();
      const holdings1 = await vault.holdings1();
      const balance0 = await dai.balanceOf(ADMIN);
      const balance1 = await weth.balanceOf(ADMIN);

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
    });
  });

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
      await vault.setManager(MANAGER);

      expect(await vault.manager()).to.equal(MANAGER);
    });
  });

  describe("Update Weights Gradually", () => {
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

  describe("Poke Weights", () => {
    it("should be reverted to call pokeWeight", async () => {
      await expect(vault.pokeWeights()).to.be.revertedWith(
        "CallerIsNotManager()",
      );
    });

    it("should be possible to call pokeWeight", async () => {
      await vault.connect(manager).pokeWeights();
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

      await vault.initializeFinalization();
      const noticeTimeoutAt = await vault.noticeTimeoutAt();

      await expect(vault.finalize()).to.be.revertedWith(
        `NoticeTimeoutNotElapsed(${noticeTimeoutAt})`,
      );
    });

    it("should be possible to finalize", async () => {
      await ethers.provider.send("evm_increaseTime", [NOTICE_PERIOD + 1]);
      await vault.finalize();

      expect(await dai.balanceOf(ADMIN)).to.equal(toWei(1000));
      expect(await weth.balanceOf(ADMIN)).to.equal(toWei(1000));
    });
  });
});
