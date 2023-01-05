import { expect } from "chai";
import { ethers } from "hardhat";

export function shouldBehaveLikeMaxMintGetter(): void {
  describe("when called by owner", function () {
    describe("when receiver is owner", function () {
      it("returns value", async function () {
        expect(
          await this.putOptionsVault.maxMint(this.signers.admin.address),
        ).to.eq(ethers.constants.MaxUint256);
      });
    });

    describe("when receiver is stranger", function () {
      it("returns zero", async function () {
        expect(
          await this.putOptionsVault.maxMint(this.signers.stranger.address),
        ).to.eq(0);
      });
    });
  });

  describe("when called by stranger", function () {
    describe("when receiver is owner", function () {
      it("returns zero", async function () {
        expect(
          await this.putOptionsVault
            .connect(this.signers.stranger)
            .maxMint(this.signers.admin.address),
        ).to.eq(0);
      });
    });

    describe("when receiver is stranger", function () {
      it("returns zero", async function () {
        expect(
          await this.putOptionsVault
            .connect(this.signers.stranger)
            .maxMint(this.signers.stranger.address),
        ).to.eq(0);
      });
    });
  });
}
