import { expect } from "chai";
import { toWei } from "../../../utils";

export function shouldBehaveLikeSetStrikeMultiplier(): void {
  describe("access", function () {
    describe("when called by controller", function () {
      it("works", async function () {
        await expect(
          this.putOptionsVault
            .connect(this.signers.admin)
            .setStrikeMultiplier(100, 1000),
        ).not.to.be.reverted;
      });
    });

    describe("when called by stranger", function () {
      it("reverts", async function () {
        await expect(
          this.putOptionsVault
            .connect(this.signers.stranger)
            .setStrikeMultiplier(100, 1000),
        ).to.be.revertedWith("AeraPOV__CallerIsNotController");
      });
    });
  });

  describe("values", function () {
    describe("when min > max", function () {
      it("reverts", async function () {
        await expect(
          this.putOptionsVault.setStrikeMultiplier(100, 10),
        ).to.be.revertedWith(
          `AeraPOV__StrikeMultiplierRangeNotValid(100, 10)`,
        );
      });
    });

    describe("when min = 0", function () {
      it("reverts", async function () {
        await expect(
          this.putOptionsVault.setStrikeMultiplier(0, 100),
        ).to.be.revertedWith(
          `AeraPOV__StrikeMultiplierMinValueBelowExpected(0, 1)`,
        );
      });
    });

    describe("when max >= 1", function () {
      it("reverts", async function () {
        const max = toWei(1);
        await expect(
          this.putOptionsVault.setStrikeMultiplier(10, max),
        ).to.be.revertedWith(
          `AeraPOV__StrikeMultiplierMaxValueExceedsExpected(${max}, ${max.sub(
            1,
          )})`,
        );
      });
    });

    describe("when values are valid", function () {
      it("works", async function () {
        await this.putOptionsVault.setStrikeMultiplier(10, 100);

        const delta = await this.putOptionsVault.strikeMultiplier();

        expect(delta.min).to.eq(10);
        expect(delta.max).to.eq(100);
      });

      it("emits", async function () {
        await expect(this.putOptionsVault.setStrikeMultiplier(10, 100))
          .to.emit(this.putOptionsVault, "StrikeMultiplierChanged")
          .withArgs(10, 100);
      });
    });
  });
}
