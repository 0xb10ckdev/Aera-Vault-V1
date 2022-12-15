import { expect } from "chai";
import { ethers } from "hardhat";

export function shouldBehaveLikeMaxDepositGetter(): void {
  describe("when called by owner", function () {
    it("returns value", async function () {
      expect(
        await this.putOptionsVault.maxDeposit(this.signers.user.address),
      ).to.eq(ethers.constants.MaxUint256);
    });
  });

  describe("when called by stranger", function () {
    it("returns zero", async function () {
      expect(
        await this.putOptionsVault
          .connect(this.signers.manager)
          .maxDeposit(this.signers.user.address),
      ).to.eq(0);
    });
  });
}
