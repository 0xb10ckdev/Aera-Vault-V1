import { expect } from "chai";

export function shouldBehaveLikeControllerGetter(): void {
  it("returns controller", async function () {
    expect(await this.putOptionsVault.controller()).to.equal(
      this.signers.admin.address,
    );
  });
}
