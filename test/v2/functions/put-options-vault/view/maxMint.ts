import { expect } from "chai";
import { ethers } from "hardhat";

export function shouldBehaveLikeMaxMintGetter(): void {
  describe("when called by owner", function () {
    it("returns value", async function () {
      expect(
        await this.putOptionsVault.maxMint(this.signers.user.address),
      ).to.eq(ethers.constants.MaxUint256);
    });
  });

  describe("when called by stranger", function () {
    it("returns zero", async function () {
      expect(
        await this.putOptionsVault
          .connect(this.signers.manager)
          .maxMint(this.signers.user.address),
      ).to.eq(0);
    });
  });
}
