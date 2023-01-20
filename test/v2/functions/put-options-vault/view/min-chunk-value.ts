import { expect } from "chai";
import { DEFAULT_MIN_CHUNK_VALUE } from "../constants";

export function shouldBehaveLikeMinChunkValueGetter(): void {
  it("returns minChunkValue", async function () {
    expect(await this.putOptionsVault.minChunkValue()).to.equal(
      DEFAULT_MIN_CHUNK_VALUE,
    );
  });
}
