import { expect } from "chai";
import { MINIMUM_WEIGHT_CHANGE_DURATION, ONE } from "../../constants";
import {
  getCurrentTime,
  increaseTime,
  normalizeWeights,
  toWei,
  tokenWithValues,
} from "../../utils";

export function testCancelWeightUpdates(): void {
  it("should be reverted when called from non-manager", async function () {
    await expect(this.vault.cancelWeightUpdates()).to.be.revertedWith(
      "Aera__CallerIsNotManager",
    );
  });

  it("should be possible to call cancelWeightUpdates", async function () {
    const timestamp = await getCurrentTime();
    const endWeights = [];
    const avgWeights = ONE.div(this.numTokens);
    const startTime = timestamp + 10;
    const endTime = timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1000;
    for (let i = 0; i < this.numTokens; i += 2) {
      if (i < this.numTokens - 1) {
        endWeights.push(avgWeights.add(toWei((i + 1) / 100)));
        endWeights.push(avgWeights.sub(toWei((i + 1) / 100)));
      } else {
        endWeights.push(avgWeights);
      }
    }

    await this.vault
      .connect(this.signers.manager)
      .updateWeightsGradually(
        tokenWithValues(this.tokenAddresses, normalizeWeights(endWeights)),
        startTime,
        endTime,
      );

    await increaseTime(MINIMUM_WEIGHT_CHANGE_DURATION / 2);

    const trx = await this.vault
      .connect(this.signers.manager)
      .cancelWeightUpdates();
    const newWeights = await this.vault.getNormalizedWeights();

    await expect(trx)
      .to.emit(this.vault, "CancelWeightUpdates")
      .withArgs(newWeights);

    await increaseTime(MINIMUM_WEIGHT_CHANGE_DURATION / 2);

    const currentWeights = await this.vault.getNormalizedWeights();

    for (let i = 0; i < this.numTokens; i++) {
      expect(newWeights[i]).to.equal(currentWeights[i]);
    }
  });
}
