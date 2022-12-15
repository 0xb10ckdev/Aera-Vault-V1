import { expect } from "chai";

export function shouldBehaveLikeStrikeMultiplierGetter(): void {
  const min = 10;
  const max = 100;

  beforeEach(async function () {
    await this.putOptionsVault.setStrikeMultiplier(min, max);
  });

  it("returns strike multiplier", async function () {
    const multiplier = await this.putOptionsVault.strikeMultiplier();

    expect(multiplier.min).to.eq(min);
    expect(multiplier.max).to.eq(max);
  });
}
