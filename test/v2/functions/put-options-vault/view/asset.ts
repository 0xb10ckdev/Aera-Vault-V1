import { expect } from "chai";

export function shouldBehaveLikeAssetGetter(): void {
  it("returns asset address", async function () {
    expect(await this.putOptionsVault.asset()).to.eq(this.usdc.address);
  });
}
