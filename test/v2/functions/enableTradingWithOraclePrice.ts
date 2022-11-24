import { expect } from "chai";
import { BigNumber } from "ethers";
import { ONE, PRICE_DEVIATION } from "../constants";
import { toUnit } from "../utils";

export function testEnableTradingWithOraclePrice(): void {
  describe("should be reverted to enable trading", async function () {
    it("when called from non-manager", async function () {
      await expect(
        this.vault.enableTradingWithOraclePrice(),
      ).to.be.revertedWith("Aera__CallerIsNotManager");
    });

    it("when oracle price is not greater than zero", async function () {
      await this.oracles[1].setLatestAnswer(0);
      await expect(
        this.vault.connect(this.manager).enableTradingWithOraclePrice(),
      ).to.be.revertedWith("Aera__OraclePriceIsInvalid");
    });
  });

  it("should be possible to enable trading", async function () {
    const oraclePrices: BigNumber[] = [toUnit(1, 8)];
    for (let i = 1; i < this.poolTokens.length; i++) {
      oraclePrices.push(toUnit(Math.floor((0.1 + Math.random()) * 50), 8));
      await this.oracles[i].setLatestAnswer(oraclePrices[i]);
    }

    await expect(
      this.vault.connect(this.manager).enableTradingWithOraclePrice(),
    )
      .to.emit(this.vault, "SetSwapEnabled")
      .withArgs(true)
      .to.emit(this.vault, "UpdateWeightsWithOraclePrice");

    for (let i = 0; i < this.poolTokens.length; i++) {
      expect(
        await this.vault.getSpotPrice(
          this.sortedTokens[i],
          this.sortedTokens[0],
        ),
      ).to.be.closeTo(
        oraclePrices[i].mul(1e10),
        oraclePrices[i].mul(1e10).mul(PRICE_DEVIATION).div(ONE).toNumber(),
      );
    }
    expect(await this.vault.isSwapEnabled()).to.equal(true);
  });
}
