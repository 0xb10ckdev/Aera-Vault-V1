import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import hre, { deployments, ethers } from "hardhat";
import {
  IERC20,
  MammonVaultV1Mainnet,
  MammonVaultV1Mainnet__factory,
  WithdrawalValidatorMock,
  WithdrawalValidatorMock__factory,
} from "../../typechain";
import { setupTokens } from "../fixtures";
import { deployVault, toWei } from "../utils";
import { DEFAULT_NOTICE_PERIOD } from "../../scripts/config";

const ONE = toWei("1");
const MIN_WEIGHT = toWei("0.01");
const MIN_WEIGHTx50 = toWei("0.5");
const MIN_SWAP_FEE = toWei("0.000001");
const MAX_SWAP_FEE = toWei("0.1");
const NOTICE_PERIOD = 10000;
const MAX_NOTICE_PERIOD = 5184000; // 60 days in seconds

describe("Mammon Vault V1 Mainnet Deployment", function () {
  let admin: SignerWithAddress;
  let manager: SignerWithAddress;
  let validator: WithdrawalValidatorMock;
  let DAI: IERC20;
  let WETH: IERC20;

  it("should be reverted to deploy vault", async () => {
    ({ admin, manager } = await ethers.getNamedSigners());

    ({ DAI, WETH } = await setupTokens());

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

    await expect(
      deployVault(
        admin,
        "Test",
        "TEST",
        [DAI.address, WETH.address, WETH.address],
        [MIN_WEIGHTx50.toString(), MIN_WEIGHTx50.toString()],
        MIN_SWAP_FEE.toString(),
        ONE.toString(),
        manager.address,
      ),
    ).to.be.revertedWith("Mammon__LengthIsNotSame");
    await expect(
      deployVault(
        admin,
        "Test",
        "TEST",
        [DAI.address, WETH.address],
        [MIN_WEIGHTx50.toString(), MIN_WEIGHTx50.toString()],
        MIN_SWAP_FEE.toString(),
        ONE.toString(),
        manager.address,
        validator.address,
        MAX_NOTICE_PERIOD + 1,
      ),
    ).to.be.revertedWith("Mammon__NoticePeriodIsAboveMax");
    await expect(
      deployVault(
        admin,
        "Test",
        "TEST",
        [DAI.address, WETH.address],
        [MIN_WEIGHTx50.toString(), MIN_WEIGHTx50.toString()],
        MIN_SWAP_FEE.toString(),
        ONE.toString(),
        manager.address,
        manager.address,
      ),
    ).to.be.revertedWith("Mammon__ValidatorIsNotValid");
    await expect(
      deployVault(
        admin,
        "Test",
        "TEST",
        [DAI.address, WETH.address],
        [MIN_WEIGHTx50.toString(), MIN_WEIGHTx50.toString()],
        MIN_SWAP_FEE.toString(),
        ONE.toString(),
        manager.address,
        (
          await deployments.get("InvalidValidator")
        ).address,
      ),
    ).to.be.revertedWith("Mammon__ValidatorIsNotValid");
    await expect(
      deployVault(
        admin,
        "Test",
        "TEST",
        [DAI.address, WETH.address],
        [MIN_WEIGHTx50.toString(), MIN_WEIGHTx50.toString()],
        ONE.toString(),
        ONE.toString(),
        manager.address,
        validator.address,
      ),
    ).to.be.revertedWith("BAL#202"); // MAX_SWAP_FEE_PERCENTAGE
    await expect(
      deployVault(
        admin,
        "Test",
        "TEST",
        [DAI.address, WETH.address],
        [MIN_WEIGHTx50.toString(), MIN_WEIGHTx50.toString()],
        MIN_SWAP_FEE.div(2).toString(),
        ONE.toString(),
        manager.address,
        validator.address,
      ),
    ).to.be.revertedWith("BAL#203"); // MIN_SWAP_FEE_PERCENTAGE
    await expect(
      deployVault(
        admin,
        "Test",
        "TEST",
        [DAI.address, WETH.address],
        [MIN_WEIGHT.toString(), MIN_WEIGHT.toString()],
        MIN_SWAP_FEE.toString(),
        ONE.toString(),
        manager.address,
        validator.address,
      ),
    ).to.be.revertedWith("BAL#308"); // NORMALIZED_WEIGHT_INVARIANT
    await expect(
      deployVault(
        admin,
        "Test",
        "TEST",
        [DAI.address, WETH.address],
        [MIN_WEIGHTx50.toString(), MIN_WEIGHTx50.toString()],
        MIN_SWAP_FEE.toString(),
        ONE.add(1).toString(),
        manager.address,
        validator.address,
      ),
    ).to.be.revertedWith("BAL#338"); // MAX_MANAGEMENT_SWAP_FEE_PERCENTAGE
  });
});

describe("Mammon Vault V1 Mainnet Functionality", function () {
  let admin: SignerWithAddress;
  let manager: SignerWithAddress;
  let vault: MammonVaultV1Mainnet;
  let validator: WithdrawalValidatorMock;
  let DAI: IERC20;
  let WETH: IERC20;
  let snapshot: unknown;

  beforeEach(async function () {
    snapshot = await ethers.provider.send("evm_snapshot", []);
    ({ admin, manager } = await ethers.getNamedSigners());

    ({ DAI, WETH } = await setupTokens());

    await deployments.deploy("Validator", {
      contract: "WithdrawalValidatorMock",
      from: admin.address,
      log: true,
    });
    validator = WithdrawalValidatorMock__factory.connect(
      (await deployments.get("Validator")).address,
      admin,
    );

    await hre.run("deploy:vault", {
      name: "Test",
      symbol: "TEST",
      tokens: [DAI.address, WETH.address].join(","),
      weights: [
        MIN_WEIGHT.mul(40).toString(),
        MIN_WEIGHT.mul(60).toString(),
      ].join(","),
      swapFee: MIN_SWAP_FEE.toString(),
      managementSwapFee: ONE.toString(),
      manager: manager.address,
      validator: validator.address,
      noticePeriod: DEFAULT_NOTICE_PERIOD.toString(),
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
      await DAI.approve(vault.address, ONE);
      await WETH.approve(vault.address, ONE);
    });

    it("should be reverted to call functions", async () => {
      await expect(vault.deposit(ONE, ONE)).to.be.revertedWith(
        "Mammon__VaultNotInitialized",
      );

      await expect(vault.withdraw(ONE, ONE)).to.be.revertedWith(
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
  });
});
