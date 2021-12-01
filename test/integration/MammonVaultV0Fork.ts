import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import hre, { deployments, ethers } from "hardhat";
import {
  IERC20,
  MammonVaultV1Mainnet,
  MammonVaultV1Mainnet__factory,
} from "../../typechain";
import { setupTokens } from "../fixtures";
import { deployVault, toWei } from "../utils";
import { DEFAULT_NOTICE_PERIOD } from "../../scripts/config";

const ONE_TOKEN = toWei("1");
const MIN_WEIGHT = toWei("1");

describe("Mammon Vault v0 Mainnet", function () {
  let admin: SignerWithAddress;
  let manager: SignerWithAddress;
  let vault: MammonVaultV1Mainnet;
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
        [DAI.address, WETH.address],
        [MIN_WEIGHT.toString(), MIN_WEIGHT.toString()],
        ONE_TOKEN.toString(),
        ONE_TOKEN.toString(),
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
        [MIN_WEIGHT.toString(), MIN_WEIGHT.toString()],
        ONE_TOKEN.toString(),
        ONE_TOKEN.toString(),
        manager.address,
        (
          await deployments.get("InvalidValidator")
        ).address,
      ),
    ).to.be.revertedWith("Mammon__ValidatorIsNotValid");

    await hre.run("deploy:vault", {
      name: "Test",
      symbol: "TEST",
      tokens: [DAI.address, WETH.address].join(","),
      weights: [MIN_WEIGHT.toString(), MIN_WEIGHT.toString()].join(","),
      swapFee: ONE_TOKEN.toString(),
      managementSwapFee: ONE_TOKEN.toString(),
      manager: manager.address,
      validator: (await deployments.get("Validator")).address,
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
  });
});
