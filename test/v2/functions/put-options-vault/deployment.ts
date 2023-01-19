import { expect } from "chai";
import { DeployPutOptionsVault } from "../../../../tasks/deploy/put-options-vault";
import { PutOptionsVault__factory } from "../../../../typechain/factories/PutOptionsVault__factory";
import { toUnit } from "../../../common/utils";
import { ZERO_ADDRESS } from "../../constants";
import { toWei } from "../../utils";
import {
  EXPIRY_DELTA_MAX,
  EXPIRY_DELTA_MIN,
  MAX_ORDER_ACTIVE,
  STRIKE_MULTIPLIER_MAX,
  STRIKE_MULTIPLIER_MIN,
  USDC_DECIMALS,
} from "./constants";

type DeployPutOptionsVaultRaw = Omit<DeployPutOptionsVault, "silent">;

export function shouldBehaveLikePutOptionsVaultDeployment(): void {
  let validArgs: DeployPutOptionsVaultRaw;

  describe("when PutOptionVault is deployed", function () {
    let factory: PutOptionsVault__factory;

    beforeEach(async function () {
      validArgs = {
        controller: this.signers.admin.address,
        liquidator: this.signers.admin.address,
        broker: this.signers.admin.address,
        pricer: this.mocks.pricer.address,
        underlyingAsset: this.usdc.address,
        underlyingOptionsAsset: this.weth.address,
        expiryDeltaMin: EXPIRY_DELTA_MIN,
        expiryDeltaMax: EXPIRY_DELTA_MAX,
        strikeMultiplierMin: toWei(STRIKE_MULTIPLIER_MIN),
        strikeMultiplierMax: toWei(STRIKE_MULTIPLIER_MAX),
        minChunkValue: toUnit(1, USDC_DECIMALS),
        maxOrderActive: MAX_ORDER_ACTIVE,
        name: "USDC Put Option Vault",
        symbol: "oUSDCpVault",
        opynAddressBook: this.mocks.addressBook.address,
      };

      factory = new PutOptionsVault__factory(this.signers.admin);
    });

    function deployVault(args: DeployPutOptionsVaultRaw) {
      return factory.deploy({
        controller: args.controller,
        liquidator: args.liquidator,
        broker: args.broker,
        pricer: args.pricer,
        underlyingAsset: args.underlyingAsset,
        underlyingOptionsAsset: args.underlyingOptionsAsset,
        expiryDelta: { min: args.expiryDeltaMin, max: args.expiryDeltaMax },
        strikeMultiplier: {
          min: args.strikeMultiplierMin,
          max: args.strikeMultiplierMax,
        },
        minChunkValue: args.minChunkValue,
        maxOrderActive: args.maxOrderActive ?? MAX_ORDER_ACTIVE,
        name: args.name,
        symbol: args.symbol,
        opynAddressBook: args.opynAddressBook,
      });
    }

    it("deploys", async () => {
      await expect(deployVault(validArgs)).not.to.be.reverted;
    });

    describe("when controller is zero address", () => {
      it("reverts", async () => {
        await expect(
          deployVault({ ...validArgs, controller: ZERO_ADDRESS }),
        ).to.be.revertedWith("AeraPOV__ControllerIsZeroAddress");
      });
    });

    describe("when liquidator is zero address", () => {
      it("reverts", async () => {
        await expect(
          deployVault({ ...validArgs, liquidator: ZERO_ADDRESS }),
        ).to.be.revertedWith("AeraPOV__LiquidatorIsZeroAddress");
      });
    });

    describe("when broker is zero address", () => {
      it("reverts", async () => {
        await expect(
          deployVault({ ...validArgs, broker: ZERO_ADDRESS }),
        ).to.be.revertedWith("AeraPOV__BrokerIsZeroAddress");
      });
    });

    describe("when underlyingAsset is zero address", () => {
      it("reverts", async () => {
        await expect(
          deployVault({ ...validArgs, underlyingAsset: ZERO_ADDRESS }),
        ).to.be.revertedWith("AeraPOV__UnderlyingAssetIsZeroAddress");
      });
    });

    describe("when underlyingOptionsAsset is zero address", () => {
      it("reverts", async () => {
        await expect(
          deployVault({ ...validArgs, underlyingOptionsAsset: ZERO_ADDRESS }),
        ).to.be.revertedWith("AeraPOV__UnderlyingOptionsAssetIsZeroAddress");
      });
    });

    describe("when Opyn Address Book is zero address", () => {
      it("reverts", async () => {
        await expect(
          deployVault({ ...validArgs, opynAddressBook: ZERO_ADDRESS }),
        ).to.be.revertedWith("AeraPOV__OpynAddressBookIsZeroAddress");
      });
    });

    describe("when expiry delta", function () {
      describe("when min > max", function () {
        it("reverts", async function () {
          await expect(
            deployVault({
              ...validArgs,
              expiryDeltaMin: 100,
              expiryDeltaMax: 0,
            }),
          ).to.be.revertedWith(`AeraPOV__ExpiryDeltaRangeNotValid(100, 0)`);
        });
      });

      describe("when values are valid", function () {
        it("emits", async function () {
          const vault = await deployVault(validArgs);

          await expect(vault.deployTransaction)
            .to.emit(vault, "ExpiryDeltaChanged")
            .withArgs(EXPIRY_DELTA_MIN, EXPIRY_DELTA_MAX);
        });
      });
    });

    describe("when strike multiplier", function () {
      describe("when min > max", function () {
        it("reverts", async function () {
          await expect(
            deployVault({
              ...validArgs,
              strikeMultiplierMin: 100,
              strikeMultiplierMax: 10,
            }),
          ).to.be.revertedWith(
            `AeraPOV__StrikeMultiplierRangeNotValid(100, 10)`,
          );
        });
      });

      describe("when min = 0", function () {
        it("reverts", async function () {
          await expect(
            deployVault({
              ...validArgs,
              strikeMultiplierMin: 0,
              strikeMultiplierMax: 100,
            }),
          ).to.be.revertedWith(
            `AeraPOV__StrikeMultiplierMinValueBelowExpected(0, 1)`,
          );
        });
      });

      describe("when max >= 1", function () {
        it("reverts", async function () {
          const max = toWei(1);
          await expect(
            deployVault({
              ...validArgs,
              strikeMultiplierMin: 10,
              strikeMultiplierMax: max,
            }),
          ).to.be.revertedWith(
            `AeraPOV__StrikeMultiplierMaxValueExceedsExpected(${max}, ${max.sub(
              1,
            )})`,
          );
        });
      });

      describe("when values are valid", function () {
        it("emits", async function () {
          const vault = await deployVault(validArgs);

          await expect(vault.deployTransaction)
            .to.emit(vault, "StrikeMultiplierChanged")
            .withArgs(
              toWei(STRIKE_MULTIPLIER_MIN),
              toWei(STRIKE_MULTIPLIER_MAX),
            );
        });
      });
    });

    describe("when pricer", function () {
      describe("is zero address", () => {
        it("reverts", async () => {
          await expect(
            deployVault({
              ...validArgs,
              pricer: ZERO_ADDRESS,
            }),
          ).to.be.revertedWith(
            `AeraPOV__PutOptionsPricerIsNotValid("${ZERO_ADDRESS}")`,
          );
        });
      });

      describe("is wrong contract", function () {
        it("reverts", async function () {
          await expect(
            deployVault({
              ...validArgs,
              pricer: this.weth.address,
            }),
          ).to.be.revertedWith(
            `AeraPOV__PutOptionsPricerIsNotValid("${this.weth.address}")`,
          );
        });
      });
    });
  });
}
