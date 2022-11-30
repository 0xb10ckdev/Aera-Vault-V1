import { expect } from "chai";
import { IERC20 } from "../../../typechain";
import { ONE } from "../constants";
import { deployToken } from "../fixtures";
import {
  normalizeWeights,
  toWei,
  tokenValueArray,
  tokenWithValues,
  toUnit,
  valueArray,
} from "../utils";

export function testGetSpotPrices(): void {
  let TOKEN: IERC20;
  beforeEach(async function () {
    ({ TOKEN } = await deployToken());
    for (let i = 0; i < this.tokens.length; i++) {
      await this.tokens[i].approve(this.vault.address, ONE);
    }

    for (let i = 1; i < this.poolTokens.length; i++) {
      await this.oracles[i].setLatestAnswer(toUnit(1, 8));
    }

    await this.vault.initialDeposit(
      tokenValueArray(this.tokenAddresses, ONE, this.tokens.length),
      tokenWithValues(
        this.tokenAddresses,
        normalizeWeights(valueArray(ONE, this.tokens.length)),
      ),
    );
  });

  it("should return zero for invalid token", async function () {
    const spotPrices = await this.vault.getSpotPrices(TOKEN.address);

    for (let i = 0; i < this.poolTokens.length; i++) {
      expect(spotPrices[i]).to.equal(toWei(0));
      expect(
        await this.vault.getSpotPrice(TOKEN.address, this.sortedTokens[i]),
      ).to.equal(toWei(0));
      expect(
        await this.vault.getSpotPrice(this.sortedTokens[i], TOKEN.address),
      ).to.equal(toWei(0));
    }
  });
}
