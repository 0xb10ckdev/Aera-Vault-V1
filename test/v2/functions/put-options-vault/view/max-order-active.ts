import { expect } from "chai";
import { MAX_ORDER_ACTIVE } from "../constants";

export function shouldBehaveLikeMaxOrderActiveGetter(): void {
  it("returns maxOrderActive", async function () {
    expect(await this.putOptionsVault.maxOrderActive()).to.equal(
      MAX_ORDER_ACTIVE,
    );
  });
}
