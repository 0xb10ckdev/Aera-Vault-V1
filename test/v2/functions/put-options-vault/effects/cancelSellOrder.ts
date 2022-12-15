import { expect } from "chai";

export function shouldBehaveLikeCancelSellOrder(): void {
  describe("when sell order is not active", function () {
    it("reverts", async function () {
      await expect(this.putOptionsVault.cancelSellOrder()).to.be.revertedWith(
        "Aera__SellOrderIsNotActive",
      );
    });
  });
}
