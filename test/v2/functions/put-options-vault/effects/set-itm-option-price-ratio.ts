import { expect } from "chai";

export function shouldBehaveLikeSetITMOptionPriceRatio(): void {
  describe("access", function () {
    describe("when called by controller", function () {
      it("works", async function () {
        await expect(
          this.putOptionsVault
            .connect(this.signers.admin)
            .setITMOptionPriceRatio(100),
        ).not.to.be.reverted;
      });
    });

    describe("when called by stranger", function () {
      it("reverts", async function () {
        await expect(
          this.putOptionsVault
            .connect(this.signers.stranger)
            .setITMOptionPriceRatio(100),
        ).to.be.revertedWith("AeraPOV__CallerIsNotController");
      });
    });
  });

  describe("values", function () {
    it("works", async function () {
      await this.putOptionsVault.setITMOptionPriceRatio(100);

      expect(await this.putOptionsVault.itmOptionPriceRatio()).to.eq(100);
    });

    it("emits", async function () {
      await expect(this.putOptionsVault.setITMOptionPriceRatio(100))
        .to.emit(this.putOptionsVault, "ITMOptionPriceRatioChanged")
        .withArgs(100);
    });
  });
}
