import { expect } from "chai";

export function shouldBehaveLikeLiquidatorGetter(): void {
  describe("liquidator", function () {
    it("returns liquidator", async function () {
      expect(await this.putOptionsVault.liquidator()).to.equal(
        this.signers.admin.address,
      );
    });
  });
}
