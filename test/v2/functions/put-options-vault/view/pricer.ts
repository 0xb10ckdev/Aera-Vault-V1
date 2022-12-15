import { expect } from "chai";

export function shouldBehaveLikePricerGetter(): void {
  it("returns pricer", async function () {
    expect(await this.putOptionsVault.pricer()).to.equal(
      this.mocks.pricer.address,
    );
  });
}
