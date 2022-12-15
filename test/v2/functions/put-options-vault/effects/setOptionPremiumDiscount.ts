import { expect } from "chai";
import { toWei } from "../../../utils";

export function shouldBehaveLikeSetOptionPremiumDiscount(): void {
  describe("access", function () {
    describe("when called by controller", function () {
      it("works", async function () {
        await expect(
          this.putOptionsVault
            .connect(this.signers.admin)
            .setOptionPremiumDiscount(100),
        ).not.to.throw;
      });
    });

    describe("when called by stranger", function () {
      it("reverts", async function () {
        await expect(
          this.putOptionsVault
            .connect(this.signers.manager)
            .setOptionPremiumDiscount(100),
        ).to.be.revertedWith("Aera__CallerIsNotController");
      });
    });
  });

  describe("values", function () {
    describe("when discount > 1", function () {
      it("reverts", async function () {
        const max = toWei(1);
        await expect(
          this.putOptionsVault.setOptionPremiumDiscount(max.add(1)),
        ).to.be.revertedWith(
          `Aera__DiscountExceedsMaximumValue(${max.add(1)}, ${max})`,
        );
      });
    });

    describe("when value is valid", function () {
      it("works", async function () {
        await this.putOptionsVault.setOptionPremiumDiscount(100);

        expect(await this.putOptionsVault.optionsPremiumDiscount()).to.eq(100);
      });

      it("emits", async function () {
        await expect(this.putOptionsVault.setOptionPremiumDiscount(100))
          .to.emit(this.putOptionsVault, "OptionPremiumDiscountChanged")
          .withArgs(100);
      });
    });
  });
}
