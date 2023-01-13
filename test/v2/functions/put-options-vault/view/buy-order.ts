import { expect } from "chai";
import { getCurrentTime, toUnit } from "../../../utils";
import {
  EXPIRY_DELTA_MAX,
  EXPIRY_DELTA_MIN,
  STRIKE_MULTIPLIER_MAX,
  STRIKE_MULTIPLIER_MIN,
  USDC_DECIMALS,
} from "../constants";

export function shouldBehaveLikeBuyOrderGetter(): void {
  const DEPOSIT_AMOUNT = toUnit(500, USDC_DECIMALS);
  const SPOT_PRICE = toUnit(1_000, USDC_DECIMALS);
  const STRIKE_PRICE = toUnit(850, USDC_DECIMALS);

  beforeEach(async function () {
    await this.createBuyOrder(
      STRIKE_PRICE,
      (await getCurrentTime()) + EXPIRY_DELTA_MIN + 360,
      DEPOSIT_AMOUNT,
      SPOT_PRICE,
    );
  });

  it("returns buyOrder", async function () {
    const now = await getCurrentTime();
    const order = await this.putOptionsVault.buyOrder();

    expect(order.active).to.be.true;
    expect(order.underlyingAssetAmount).to.eq(DEPOSIT_AMOUNT);
    expect(order.created).to.eq(now);
    expect(order.minExpiryTimestamp).is.eq(now + EXPIRY_DELTA_MIN);
    expect(order.maxExpiryTimestamp).is.eq(now + EXPIRY_DELTA_MAX);
    expect(order.minStrikePrice).is.eq(
      SPOT_PRICE.mul(STRIKE_MULTIPLIER_MIN * 100).div(100),
    );
    expect(order.maxStrikePrice).is.eq(
      SPOT_PRICE.mul(STRIKE_MULTIPLIER_MAX * 100).div(100),
    );
  });
}
