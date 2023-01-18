import { expect } from "chai";
import { O_TOKEN_DECIMALS } from "../../functions/put-options-vault/constants";
import { getCurrentTime, toUnit } from "./../../utils";

export function shouldBehaveLikePremiaOptionsPricerGetPremium(): void {
  it("returns premium", async function () {
    const strikePrice = toUnit(1000, O_TOKEN_DECIMALS);
    const expiryTimestamp = (await getCurrentTime()) + 86400 * 30;
    /**
     * Expected value is checked against:
     * https://goodcalculators.com/black-scholes-calculator/
     * Params:
     *    Spot Price: 1417.72
     *    Strike Price: 1000.00
     *    Time To Expiration: 30 days
     *    Volatility: 69.98%
     * Result:
     *    Put Option Price: 3.95
     *
     */
    expect(
      await this.premiaPricer.getPremium(strikePrice, expiryTimestamp, true),
    ).to.be.closeTo(toUnit(3.9540508, 8), 1);
  });
}
