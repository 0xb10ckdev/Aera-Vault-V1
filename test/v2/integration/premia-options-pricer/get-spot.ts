import { expect } from "chai";
import { adjustValue } from "./../../utils";

export function shouldBehaveLikePremiaOptionsPricerGetSpot(): void {
  it("returns spot price", async function () {
    const price = await this.chainlinkOracle.latestAnswer();

    expect(await this.premiaPricer.getSpot()).to.eq(
      adjustValue(
        price,
        await this.chainlinkOracle.decimals(),
        await this.premiaPricer.decimals(),
      ),
    );
  });
}
