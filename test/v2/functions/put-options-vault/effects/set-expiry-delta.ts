import { expect } from "chai";

export function shouldBehaveLikeSetExpiryDelta(): void {
  describe("access", function () {
    describe("when called by controller", function () {
      it("works", async function () {
        await expect(
          this.putOptionsVault
            .connect(this.signers.admin)
            .setExpiryDelta(0, 100),
        ).not.to.be.reverted;
      });
    });

    describe("when called by stranger", function () {
      it("reverts", async function () {
        await expect(
          this.putOptionsVault
            .connect(this.signers.stranger)
            .setExpiryDelta(0, 100),
        ).to.be.revertedWith("AeraPOV__CallerIsNotController");
      });
    });
  });

  describe("values", function () {
    describe("when min > max", function () {
      it("reverts", async function () {
        await expect(
          this.putOptionsVault.setExpiryDelta(100, 0),
        ).to.be.revertedWith(`AeraPOV__ExpiryDeltaRangeNotValid(100, 0)`);
      });
    });

    describe("when values are valid", function () {
      it("works", async function () {
        await this.putOptionsVault.setExpiryDelta(0, 100);

        const delta = await this.putOptionsVault.expiryDelta();

        expect(delta.min).to.eq(0);
        expect(delta.max).to.eq(100);
      });

      it("emits", async function () {
        await expect(this.putOptionsVault.setExpiryDelta(0, 100))
          .to.emit(this.putOptionsVault, "ExpiryDeltaChanged")
          .withArgs(0, 100);
      });
    });
  });
}
