import { expect } from "chai";

export function shouldBehaveLikeExpiryDeltaGetter(): void {
  const min = 10;
  const max = 100;

  beforeEach(async function () {
    await this.putOptionsVault.setExpiryDelta(min, max);
  });

  it("returns expiry delta", async function () {
    const delta = await this.putOptionsVault.expiryDelta();

    expect(delta.min).to.eq(min);
    expect(delta.max).to.eq(max);
  });
}
