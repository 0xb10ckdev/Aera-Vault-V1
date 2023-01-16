import { BigNumber } from "ethers";
import { expect } from "chai";
import { adjustValue, toUnit } from "../../../utils";

export function shouldBehaveLikePremiaOptionsPricerSpotGetter(): void {
  let price: BigNumber;
  let oracleDecimals: number;
  beforeEach(async function () {
    oracleDecimals = (await this.mocks.oracle.decimals()).toNumber();
    price = toUnit(1000, oracleDecimals);

    await this.mocks.oracle.setLatestAnswer(price);
  });

  it("returns spot price", async function () {
    expect(await this.pricer.getSpot()).to.equal(
      adjustValue(price, oracleDecimals, await this.pricer.decimals()),
    );
  });
}
