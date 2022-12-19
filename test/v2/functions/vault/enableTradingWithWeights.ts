import { expect } from "chai";
import { DEVIATION, ONE } from "../../constants";
import {
  getTimestamp,
  normalizeWeights,
  tokenValueArray,
  tokenWithValues,
  toWei,
} from "../../utils";

export function testEnableTradingWithWeights(): void {
  describe("should be reverted to enable trading", function () {
    it("when called from non-owner", async function () {
      await expect(
        this.vault
          .connect(this.signers.manager)
          .enableTradingWithWeights(
            tokenValueArray(
              this.tokenAddresses,
              ONE.div(this.numTokens),
              this.numTokens,
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
            ONE.div(this.numTokens),
            this.numTokens,
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
            ONE.div(this.numTokens).sub(1),
            this.numTokens,
          ),
        ),
      ).to.be.revertedWith("Aera__SumOfWeightIsNotOne");
    });

    it("when swap is already enabled", async function () {
      await expect(
        this.vault.enableTradingWithWeights(
          tokenValueArray(
            this.tokenAddresses,
            ONE.div(this.numTokens),
            this.numTokens,
          ),
        ),
      ).to.be.revertedWith("Aera__PoolSwapIsAlreadyEnabled");
    });
  });

  it("should be possible to enable trading", async function () {
    await this.vault.disableTrading();

    const endWeights = [];
    const avgWeights = ONE.div(this.numTokens);
    for (let i = 0; i < this.numTokens; i += 2) {
      if (i < this.numTokens - 1) {
        endWeights.push(avgWeights.add(toWei((i + 1) / 100)));
        endWeights.push(avgWeights.sub(toWei((i + 1) / 100)));
      } else {
        endWeights.push(avgWeights);
      }
    }

    const trx = await this.vault.enableTradingWithWeights(
      tokenWithValues(this.tokenAddresses, normalizeWeights(endWeights)),
    );

    const currentTime = await getTimestamp(trx.blockNumber);

    await expect(trx)
      .to.emit(this.vault, "EnabledTradingWithWeights")
      .withArgs(currentTime, normalizeWeights(endWeights));

    const endPoolWeights = normalizeWeights(
      normalizeWeights(endWeights).slice(0, this.numPoolTokens),
    );
    const currentWeights = await this.vault.getNormalizedWeights();
    const currentPoolWeights = normalizeWeights(
      currentWeights.slice(0, this.numPoolTokens),
    );

    expect(await this.vault.isSwapEnabled()).to.equal(true);
    for (let i = 0; i < this.numPoolTokens; i++) {
      expect(endPoolWeights[i]).to.be.closeTo(
        currentPoolWeights[i],
        DEVIATION,
      );
    }
  });
}
