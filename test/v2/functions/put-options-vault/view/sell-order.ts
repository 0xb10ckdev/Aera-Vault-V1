import { expect } from "chai";
import { BigNumber } from "ethers";
import { MockOToken } from "../../../../../typechain";
import { getCurrentTime, toUnit } from "../../../utils";
import {
  EXPIRY_DELTA_MIN,
  O_TOKEN_DECIMALS,
  USDC_DECIMALS,
} from "../constants";

export function shouldBehaveLikeSellOrderGetter(): void {
  let oToken: MockOToken;
  let oTokenAmount: BigNumber;
  beforeEach(async function () {
    oTokenAmount = toUnit(4, O_TOKEN_DECIMALS);

    ({ oToken } = await this.createAndFillBuyOrder(
      toUnit(850, USDC_DECIMALS),
      (await getCurrentTime()) + EXPIRY_DELTA_MIN + 360,
      toUnit(500, USDC_DECIMALS),
      toUnit(1000, USDC_DECIMALS),
      oTokenAmount,
    ));

    await this.putOptionsVault.sell(oToken.address, oTokenAmount);
  });

  it("returns sell order", async function () {
    const now = await getCurrentTime();
    const order = await this.putOptionsVault.sellOrder();

    expect(order.active).to.be.true;
    expect(order.oToken).to.eq(oToken.address);
    expect(order.amount).to.eq(oTokenAmount);
    expect(order.created).to.eq(now);
  });
}
