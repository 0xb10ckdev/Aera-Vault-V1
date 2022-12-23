import { expect } from "chai";
import {
  BALANCER_ERRORS,
  MAX_SWAP_FEE,
  MAXIMUM_SWAP_FEE_PERCENT_CHANGE,
  MIN_SWAP_FEE,
  SWAP_FEE_COOLDOWN_PERIOD,
} from "../../constants";
import { increaseTime, toWei } from "../../utils";

export function testSetSwapFee(): void {
  describe("should be reverted to set swap fee", async function () {
    it("when called from non-guardian", async function () {
      await expect(this.vault.setSwapFee(toWei(3))).to.be.revertedWith(
        "Aera__CallerIsNotGuardian()",
      );
    });

    it("when swap fee is greater than balancer maximum", async function () {
      let newFee = await this.vault.getSwapFee();
      while (newFee.lte(MAX_SWAP_FEE)) {
        await this.vault.connect(this.signers.guardian).setSwapFee(newFee);
        await increaseTime(SWAP_FEE_COOLDOWN_PERIOD);
        newFee = newFee.add(MAXIMUM_SWAP_FEE_PERCENT_CHANGE);
      }
      await expect(
        this.vault
          .connect(this.signers.guardian)
          .setSwapFee(MAX_SWAP_FEE.add(1)),
      ).to.be.revertedWith(BALANCER_ERRORS.MAX_SWAP_FEE_PERCENTAGE);
    });

    it("when swap fee is less than balancer minimum", async function () {
      let newFee = await this.vault.getSwapFee();
      while (newFee.gte(MIN_SWAP_FEE)) {
        await this.vault.connect(this.signers.guardian).setSwapFee(newFee);
        await increaseTime(SWAP_FEE_COOLDOWN_PERIOD);
        newFee = newFee.sub(MAXIMUM_SWAP_FEE_PERCENT_CHANGE);
      }
      await expect(
        this.vault
          .connect(this.signers.guardian)
          .setSwapFee(MIN_SWAP_FEE.sub(1)),
      ).to.be.revertedWith(BALANCER_ERRORS.MIN_SWAP_FEE_PERCENTAGE);
    });
  });

  it("should be possible to set swap fee", async function () {
    const fee = await this.vault.getSwapFee();
    const newFee = fee.add(MAXIMUM_SWAP_FEE_PERCENT_CHANGE);
    expect(
      await this.vault
        .connect(this.signers.guardian)
        .estimateGas.setSwapFee(newFee),
    ).to.below(90000);

    await expect(this.vault.connect(this.signers.guardian).setSwapFee(newFee))
      .to.emit(this.vault, "SetSwapFee")
      .withArgs(newFee);

    expect(await this.vault.getSwapFee()).to.equal(newFee);
  });
}
