import { BigNumber } from "ethers";
import { toUnit } from "./../../../../common/utils";
import { O_TOKEN_DECIMALS } from "./../../put-options-vault/constants";
import { expect } from "chai";
import { getCurrentTime } from "../../../utils";

export function shouldBehaveLikePremiaOptionsPricerPremiumGetter(): void {
  const PRICE_64X64 = BigNumber.from("232428975328740340000"); // 12.6 * 2**64

  beforeEach(async function () {
    await this.mocks.volatilitySurfaceOracle.setBlackScholesPrice64x64(
      PRICE_64X64,
    );
  });

  it("returns premium", async function () {
    const strikePrice = toUnit(1000, O_TOKEN_DECIMALS);
    const expiryTimestamp = await getCurrentTime();

    expect(
      await this.pricer.getPremium(strikePrice, expiryTimestamp, true),
    ).to.be.closeTo(toUnit(12.6, O_TOKEN_DECIMALS), 1);
  });
}
