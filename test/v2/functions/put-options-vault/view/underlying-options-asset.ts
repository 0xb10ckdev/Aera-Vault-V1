import { expect } from "chai";

export function shouldBehaveLikeUnderlyingOptionsAssetGetter(): void {
  it("returns underlyingOptionsAsset", async function () {
    expect(await this.putOptionsVault.underlyingOptionsAsset()).to.equal(
      this.weth.address,
    );
  });
}
