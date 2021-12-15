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
import { setupTokens } from "../fixtures";
import { deployFactory, deployVault, toWei } from "../utils";
import { DEFAULT_NOTICE_PERIOD } from "../../scripts/config";

const ONE = toWei("1");
const MIN_WEIGHT = toWei("0.01");
const MIN_WEIGHTx50 = toWei("0.5");
const MIN_SWAP_FEE = toWei("0.000001");
const MAX_SWAP_FEE = toWei("0.1");
const ZERO_ADDRESS = ethers.constants.AddressZero;
const MAX_NOTICE_PERIOD = 5184000; // 60 days in seconds

describe("Mammon Vault V1 Mainnet Deployment", function () {
  let admin: SignerWithAddress;
  let manager: SignerWithAddress;
  let validator: WithdrawalValidatorMock;
  let factory: MammonPoolFactoryV1;
  let WETH: IERC20;
  let sortedTokens: string[];
  let unsortedTokens: string[];

  it("should be reverted to deploy vault", async () => {
    ({ admin, manager } = await ethers.getNamedSigners());

    ({ WETH, sortedTokens, unsortedTokens } = await setupTokens());

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

    await expect(
      deployVault(
        admin,
        factory.address,
        "Test",
        "TEST",
        [...sortedTokens, WETH.address],
        [MIN_WEIGHTx50.toString(), MIN_WEIGHTx50.toString()],
        MIN_SWAP_FEE.toString(),
        ONE.toString(),
        manager.address,
      ),
    ).to.be.revertedWith("Mammon__LengthIsNotSame");
    await expect(
      deployVault(
        admin,
        factory.address,
        "Test",
        "TEST",
        sortedTokens,
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
        factory.address,
        "Test",
        "TEST",
        sortedTokens,
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
        factory.address,
        "Test",
        "TEST",
        sortedTokens,
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
        factory.address,
        "Test",
        "TEST",
        unsortedTokens,
        [MIN_WEIGHTx50.toString(), MIN_WEIGHTx50.toString()],
        MIN_SWAP_FEE.toString(),
        ONE.toString(),
        manager.address,
        validator.address,
      ),
    ).to.be.revertedWith("BAL#101"); // UNSORTED_ARRAY
    await expect(
      deployVault(
        admin,
        factory.address,
        "Test",
        "TEST",
        sortedTokens,
        [MIN_WEIGHTx50.toString(), MIN_WEIGHTx50.toString()],
        MAX_SWAP_FEE.add(1).toString(),
        ONE.toString(),
        manager.address,
        validator.address,
      ),
    ).to.be.revertedWith("BAL#202"); // MAX_SWAP_FEE_PERCENTAGE
    await expect(
      deployVault(
        admin,
        factory.address,
        "Test",
        "TEST",
        sortedTokens,
        [MIN_WEIGHTx50.toString(), MIN_WEIGHTx50.toString()],
        MIN_SWAP_FEE.sub(1).toString(),
        ONE.toString(),
        manager.address,
        validator.address,
      ),
    ).to.be.revertedWith("BAL#203"); // MIN_SWAP_FEE_PERCENTAGE
    await expect(
      deployVault(
        admin,
        factory.address,
        "Test",
        "TEST",
        sortedTokens,
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
        factory.address,
        "Test",
        "TEST",
        sortedTokens,
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
  let factory: MammonPoolFactoryV1;
  let DAI: IERC20;
  let WETH: IERC20;
  let sortedTokens: string[];
  let snapshot: unknown;

  const getStates = async () => {
    const holdings0 = await vault.holding(0);
    const holdings1 = await vault.holding(1);
    const balance0 = await DAI.balanceOf(admin.address);
    const balance1 = await WETH.balanceOf(admin.address);

    return {
      holdings0,
      holdings1,
      balance0,
      balance1,
    };
  };

  beforeEach(async function () {
    snapshot = await ethers.provider.send("evm_snapshot", []);
    ({ admin, manager } = await ethers.getNamedSigners());

    ({ DAI, WETH, sortedTokens } = await setupTokens());

    await deployments.deploy("Validator", {
      contract: "WithdrawalValidatorMock",
      from: admin.address,
      log: true,
    });
    validator = WithdrawalValidatorMock__factory.connect(
      (await deployments.get("Validator")).address,
      admin,
    );

    await hre.run("deploy:factory");
    factory = MammonPoolFactoryV1__factory.connect(
      (await deployments.get("MammonPoolFactoryV1")).address,
      admin,
    );

    await hre.run("deploy:vault", {
      factory: factory.address,
      name: "Test",
      symbol: "TEST",
      tokens: sortedTokens.join(","),
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
      await expect(vault.deposit([ONE, ONE])).to.be.revertedWith(
        "Mammon__VaultNotInitialized",
      );

      await expect(vault.withdraw([ONE, ONE])).to.be.revertedWith(
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

      await expect(vault.initializeFinalization()).to.be.revertedWith(
        "Mammon__VaultNotInitialized",
      );

      await expect(
        vault.connect(manager).setPublicSwap(true),
      ).to.be.revertedWith("VaultNotInitialized");
    });

    it("should be reverted to initialize the vault", async () => {
      await expect(vault.initialDeposit([ONE.add(1), ONE])).to.be.revertedWith(
        "ERC20: transfer amount exceeds allowance",
      );

      await expect(vault.initialDeposit([ONE, ONE.add(1)])).to.be.revertedWith(
        "ERC20: transfer amount exceeds allowance",
      );

      await expect(vault.initialDeposit([0, ONE])).to.be.revertedWith(
        "BAL#311",
      ); // ZERO_INVARIANT

      await expect(vault.initialDeposit([ONE, 0])).to.be.revertedWith(
        "BAL#311",
      ); // ZERO_INVARIANT
    });

    it("should be possible to initialize the vault", async () => {
      const { balance0, balance1 } = await getStates();

      expect(await vault.estimateGas.initialDeposit([ONE, ONE])).to.below(
        500000,
      );
      await vault.initialDeposit([ONE, ONE]);

      expect(await DAI.balanceOf(admin.address)).to.equal(balance0.sub(ONE));
      expect(await WETH.balanceOf(admin.address)).to.equal(balance1.sub(ONE));
      expect(await DAI.balanceOf(await vault.bVault())).to.equal(ONE);
      expect(await WETH.balanceOf(await vault.bVault())).to.equal(ONE);
    });

    it("should be reverted to initialize the vault again", async () => {
      await vault.initialDeposit([ONE, ONE]);

      await expect(vault.initialDeposit([ONE, ONE])).to.be.revertedWith(
        "Mammon__VaultIsAlreadyInitialized",
      );
    });
  });

  describe("when Vault is initialized", () => {
    beforeEach(async () => {
      await DAI.approve(vault.address, toWei(100));
      await WETH.approve(vault.address, toWei(100));
      await vault.initialDeposit([ONE, ONE]);
    });

    describe("when depositing to Vault", () => {
      it("should be reverted to deposit tokens", async () => {
        await expect(vault.deposit([toWei(0), toWei(100)])).to.be.revertedWith(
          "ERC20: transfer amount exceeds allowance",
        );

        await expect(
          vault.deposit([toWei(100), toWei(100)]),
        ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
      });
    });
  });

  describe("Update Elements", () => {
    describe("Update Manager", () => {
      it("should be reverted to change manager", async () => {
        await expect(vault.setManager(ZERO_ADDRESS)).to.be.revertedWith(
          "Mammon__ManagerIsZeroAddress",
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
  });
});
