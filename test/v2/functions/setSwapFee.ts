import { expect } from "chai";
import {
  BALANCER_ERRORS,
  MAX_SWAP_FEE,
  MAXIMUM_SWAP_FEE_PERCENT_CHANGE,
  MIN_SWAP_FEE,
  SWAP_FEE_COOLDOWN_PERIOD,
} from "../constants";
import { increaseTime, toWei } from "../utils";

export function testSetSwapFee(): void {
  describe("should be reverted to set swap fee", async function () {
    it("when called from non-manager", async function () {
      await expect(this.vault.setSwapFee(toWei(3))).to.be.revertedWith(
        "Aera__CallerIsNotManager()",
      );
    });

    it("when swap fee is greater than balancer maximum", async function () {
      let newFee = await this.vault.getSwapFee();
      while (newFee.lte(MAX_SWAP_FEE)) {
        await this.vault.connect(this.manager).setSwapFee(newFee);
        await increaseTime(SWAP_FEE_COOLDOWN_PERIOD);
        newFee = newFee.add(MAXIMUM_SWAP_FEE_PERCENT_CHANGE);
      }
      await expect(
        this.vault.connect(this.manager).setSwapFee(MAX_SWAP_FEE.add(1)),
      ).to.be.revertedWith(BALANCER_ERRORS.MAX_SWAP_FEE_PERCENTAGE);
    });

    it("when swap fee is less than balancer minimum", async function () {
      let newFee = await this.vault.getSwapFee();
      while (newFee.gte(MIN_SWAP_FEE)) {
        await this.vault.connect(this.manager).setSwapFee(newFee);
        await increaseTime(SWAP_FEE_COOLDOWN_PERIOD);
        newFee = newFee.sub(MAXIMUM_SWAP_FEE_PERCENT_CHANGE);
      }
      await expect(
        this.vault.connect(this.manager).setSwapFee(MIN_SWAP_FEE.sub(1)),
      ).to.be.revertedWith(BALANCER_ERRORS.MIN_SWAP_FEE_PERCENTAGE);
    });
  });

  it("should be possible to set swap fee", async function () {
    const fee = await this.vault.getSwapFee();
    const newFee = fee.add(MAXIMUM_SWAP_FEE_PERCENT_CHANGE);
    expect(
      await this.vault.connect(this.manager).estimateGas.setSwapFee(newFee),
    ).to.below(90000);
    await this.vault.connect(this.manager).setSwapFee(newFee);

    expect(await this.vault.getSwapFee()).to.equal(newFee);
  });
}
