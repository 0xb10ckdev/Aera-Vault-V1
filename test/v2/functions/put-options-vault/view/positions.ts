import { expect } from "chai";
import { MockOToken } from "../../../../../typechain";
import { getCurrentTime, toUnit } from "../../../utils";
import { EXPIRY_DELTA_MIN, USDC_DECIMALS } from "../constants";

export function shouldBehaveLikePositionsGetter(): void {
  const N = 5;
  const oTokens: MockOToken[] = [];
  beforeEach(async function () {
    for (let i = 0; i < N; i++) {
      const { oToken } = await this.createAndFillBuyOrder(
        toUnit(850, USDC_DECIMALS),
        (await getCurrentTime()) + EXPIRY_DELTA_MIN + 360 * (i + 1),
        toUnit(500, USDC_DECIMALS),
        toUnit(1000, USDC_DECIMALS),
      );
      oTokens.push(oToken);
    }
  });

  it("should return positions", async function () {
    const positions = await this.putOptionsVault.positions();

    expect(positions).to.be.lengthOf(N);
    expect(positions).to.deep.eq(oTokens.map(x => x.address));
  });
}
