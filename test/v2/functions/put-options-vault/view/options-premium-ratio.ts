import { expect } from "chai";
import { toWei } from "../../../utils";
import { DEFAULT_OPTION_PREMIUM_RATIO } from "../constants";

export function shouldBehaveLikeOptionPremiumRatioGetter(): void {
  it("returns default value", async function () {
    expect(await this.putOptionsVault.optionPremiumRatio()).to.eq(
      DEFAULT_OPTION_PREMIUM_RATIO,
    );
  });

  describe("returns valid value", async function () {
    const discount = toWei(0.1);

    beforeEach(async function () {
      await this.putOptionsVault.setOptionPremiumRatio(discount);
    });

    it("returns valid value", async function () {
      expect(await this.putOptionsVault.optionPremiumRatio()).to.equal(
        discount,
      );
    });
  });
}
