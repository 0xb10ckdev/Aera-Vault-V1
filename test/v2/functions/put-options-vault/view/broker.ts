import { expect } from "chai";

export function shouldBehaveLikeBrokerGetter(): void {
  it("returns broker", async function () {
    expect(await this.putOptionsVault.broker()).to.equal(
      this.signers.admin.address,
    );
  });
}
