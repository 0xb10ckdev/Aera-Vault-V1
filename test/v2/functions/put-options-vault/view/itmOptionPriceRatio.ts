import { expect } from "chai";
import { toWei } from "../../../utils";
import { DEFAULT_ITM_OPTION_PRICE_RATIO } from "../constants";

export function shouldBehaveLikeItmOptionPriceRatioGetter(): void {
  it("returns default value", async function () {
    expect(await this.putOptionsVault.itmOptionPriceRatio()).to.eq(
      DEFAULT_ITM_OPTION_PRICE_RATIO,
    );
  });

  describe("returns valid value", async function () {
    const ratio = toWei(0.95);

    beforeEach(async function () {
      await this.putOptionsVault.setITMOptionPriceRatio(ratio);
    });

    it("returns valid value", async function () {
      expect(await this.putOptionsVault.itmOptionPriceRatio()).to.equal(ratio);
    });
  });
}
