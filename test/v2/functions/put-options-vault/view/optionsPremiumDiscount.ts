import { expect } from "chai";
import { toWei } from "../../../utils";
import { DEFAULT_OPTION_PREMIUM_DISCOUNT } from "../constants";

export function shouldBehaveLikeOptionsPremiumDiscountGetter(): void {
  it("returns default value", async function () {
    expect(await this.putOptionsVault.optionsPremiumDiscount()).to.eq(
      DEFAULT_OPTION_PREMIUM_DISCOUNT,
    );
  });

  describe("returns valid value", async function () {
    const discount = toWei(0.1);

    beforeEach(async function () {
      await this.putOptionsVault.setOptionPremiumDiscount(discount);
    });

    it("returns valid value", async function () {
      expect(await this.putOptionsVault.optionsPremiumDiscount()).to.equal(
        discount,
      );
    });
  });
}
