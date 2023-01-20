import { expect } from "chai";
import { toUnit } from "../../../utils";

export function shouldBehaveLikeSetOptionPremiumRatio(): void {
  describe("access", function () {
    describe("when called by controller", function () {
      it("works", async function () {
        await expect(
          this.putOptionsVault
            .connect(this.signers.admin)
            .setOptionPremiumRatio(100),
        ).not.to.be.reverted;
      });
    });

    describe("when called by stranger", function () {
      it("reverts", async function () {
        await expect(
          this.putOptionsVault
            .connect(this.signers.stranger)
            .setOptionPremiumRatio(100),
        ).to.be.revertedWith("AeraPOV__CallerIsNotController");
      });
    });
  });

  describe("values", function () {
    describe("when ratio = 0", function () {
      it("reverts", async function () {
        await expect(
          this.putOptionsVault.setOptionPremiumRatio(0),
        ).to.be.revertedWith(`AeraPOV__OptionPremiumRatioIsZero()`);
      });
    });

    describe("when value is valid", function () {
      const value = toUnit(0.85, 18);
      it("works", async function () {
        await this.putOptionsVault.setOptionPremiumRatio(value);

        expect(await this.putOptionsVault.optionPremiumRatio()).to.eq(value);
      });

      it("emits", async function () {
        await expect(this.putOptionsVault.setOptionPremiumRatio(value))
          .to.emit(this.putOptionsVault, "OptionPremiumRatioChanged")
          .withArgs(value);
      });
    });
  });
}
