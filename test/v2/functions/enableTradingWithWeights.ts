import { expect } from "chai";
import { DEVIATION, ONE } from "../constants";
import {
  normalizeWeights,
  tokenValueArray,
  tokenWithValues,
  toWei,
} from "../utils";

export function testEnableTradingWithWeights(): void {
  describe("should be reverted to enable trading", function () {
    it("when called from non-owner", async function () {
      await expect(
        this.vault
          .connect(this.manager)
          .enableTradingWithWeights(
            tokenValueArray(
              this.tokenAddresses,
              ONE.div(this.tokens.length),
              this.tokens.length,
            ),
          ),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("when token is not sorted", async function () {
      await this.vault.disableTrading();

      await expect(
        this.vault.enableTradingWithWeights(
          tokenValueArray(
            this.unsortedTokens,
            ONE.div(this.tokens.length),
            this.tokens.length,
          ),
        ),
      ).to.be.revertedWith("Aera__DifferentTokensInPosition");
    });

    it("when total sum of weights is not one", async function () {
      await this.vault.disableTrading();

      await expect(
        this.vault.enableTradingWithWeights(
          tokenValueArray(
            this.tokenAddresses,
            ONE.div(this.tokens.length).sub(1),
            this.tokens.length,
          ),
        ),
      ).to.be.revertedWith("Aera__SumOfWeightIsNotOne");
    });

    it("when swap is already enabled", async function () {
      await expect(
        this.vault.enableTradingWithWeights(
          tokenValueArray(
            this.tokenAddresses,
            ONE.div(this.tokens.length),
            this.tokens.length,
          ),
        ),
      ).to.be.revertedWith("Aera__PoolSwapIsAlreadyEnabled");
    });
  });

  it("should be possible to enable trading", async function () {
    await this.vault.disableTrading();

    const endWeights = [];
    const avgWeights = ONE.div(this.tokens.length);
    for (let i = 0; i < this.tokens.length; i += 2) {
      if (i < this.tokens.length - 1) {
        endWeights.push(avgWeights.add(toWei((i + 1) / 100)));
        endWeights.push(avgWeights.sub(toWei((i + 1) / 100)));
      } else {
        endWeights.push(avgWeights);
      }
    }

    await this.vault.enableTradingWithWeights(
      tokenWithValues(this.tokenAddresses, normalizeWeights(endWeights)),
    );

    const endPoolWeights = normalizeWeights(
      normalizeWeights(endWeights).slice(0, this.poolTokens.length),
    );
    const currentWeights = await this.vault.getNormalizedWeights();
    const currentPoolWeights = normalizeWeights(
      currentWeights.slice(0, this.poolTokens.length),
    );

    expect(await this.vault.isSwapEnabled()).to.equal(true);
    for (let i = 0; i < this.poolTokens.length; i++) {
      expect(endPoolWeights[i]).to.be.closeTo(
        currentPoolWeights[i],
        DEVIATION,
      );
    }
  });
}
