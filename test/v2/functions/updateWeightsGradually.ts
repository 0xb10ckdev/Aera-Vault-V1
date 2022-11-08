import { expect } from "chai";
import { ethers } from "hardhat";
import {
  BALANCER_ERRORS,
  DEVIATION,
  MAX_WEIGHT_CHANGE_RATIO,
  MINIMUM_WEIGHT_CHANGE_DURATION,
  ONE,
} from "../constants";
import {
  getCurrentTime,
  increaseTime,
  normalizeWeights,
  toWei,
  tokenValueArray,
  tokenWithValues,
  valueArray,
} from "../utils";

export function testUpdateWeightsGradually(): void {
  describe("should be reverted to call updateWeightsGradually", async function () {
    it("when called from non-manager", async function () {
      await expect(
        this.vault.updateWeightsGradually(
          tokenWithValues(
            this.tokenAddresses,
            normalizeWeights(valueArray(ONE, this.tokens.length)),
          ),
          0,
          1,
        ),
      ).to.be.revertedWith("Aera__CallerIsNotManager");
    });

    it("when token is not sorted", async function () {
      const timestamp = await getCurrentTime();
      await expect(
        this.vault
          .connect(this.manager)
          .updateWeightsGradually(
            tokenWithValues(
              this.unsortedTokens,
              normalizeWeights(valueArray(ONE, this.tokens.length)),
            ),
            timestamp + 10,
            timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 10,
          ),
      ).to.be.revertedWith("Aera__DifferentTokensInPosition");
    });

    it("when start time is greater than maximum", async function () {
      const timestamp = await getCurrentTime();
      await expect(
        this.vault
          .connect(this.manager)
          .updateWeightsGradually(
            tokenWithValues(
              this.tokenAddresses,
              normalizeWeights(valueArray(ONE, this.tokens.length)),
            ),
            2 ** 32,
            timestamp,
          ),
      ).to.be.revertedWith("Aera__WeightChangeStartTimeIsAboveMax");
    });

    it("when end time is greater than maximum", async function () {
      const timestamp = await getCurrentTime();
      await expect(
        this.vault
          .connect(this.manager)
          .updateWeightsGradually(
            tokenWithValues(
              this.tokenAddresses,
              normalizeWeights(valueArray(ONE, this.tokens.length)),
            ),
            timestamp,
            2 ** 32,
          ),
      ).to.be.revertedWith("Aera__WeightChangeEndTimeIsAboveMax");
    });

    it("when end time is earlier than start time", async function () {
      const timestamp = await getCurrentTime();
      await expect(
        this.vault
          .connect(this.manager)
          .updateWeightsGradually(
            tokenWithValues(
              this.tokenAddresses,
              normalizeWeights(valueArray(ONE, this.tokens.length)),
            ),
            timestamp - 2,
            timestamp - 1,
          ),
      ).to.be.revertedWith("Aera__WeightChangeEndBeforeStart");
    });

    it("when duration is less than minimum", async function () {
      const timestamp = await getCurrentTime();
      await expect(
        this.vault
          .connect(this.manager)
          .updateWeightsGradually(
            tokenWithValues(
              this.tokenAddresses,
              normalizeWeights(valueArray(ONE, this.tokens.length)),
            ),
            timestamp,
            timestamp + 1,
          ),
      ).to.be.revertedWith("Aera__WeightChangeDurationIsBelowMin");
    });

    it("when actual duration is less than minimum", async function () {
      const timestamp = await getCurrentTime();
      await expect(
        this.vault
          .connect(this.manager)
          .updateWeightsGradually(
            tokenWithValues(
              this.tokenAddresses,
              normalizeWeights(valueArray(ONE, this.tokens.length)),
            ),
            timestamp - 2,
            timestamp + MINIMUM_WEIGHT_CHANGE_DURATION - 1,
          ),
      ).to.be.revertedWith("Aera__WeightChangeDurationIsBelowMin");
    });

    it("when total sum of weights is not one", async function () {
      const timestamp = await getCurrentTime();
      await expect(
        this.vault
          .connect(this.manager)
          .updateWeightsGradually(
            tokenValueArray(
              this.tokenAddresses,
              ONE.div(this.tokens.length).sub(1),
              this.tokens.length,
            ),
            timestamp,
            timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1,
          ),
      ).to.be.revertedWith("Aera__SumOfWeightIsNotOne");
    });

    it("when change ratio is greater than maximum", async function () {
      const timestamp = await getCurrentTime();
      const startWeights = await this.vault.getNormalizedWeights();
      const targetWeight0 = normalizeWeights(
        startWeights.slice(0, this.poolTokens.length),
      )[0]
        .mul(ONE)
        .div(MAX_WEIGHT_CHANGE_RATIO + 2)
        .div(MINIMUM_WEIGHT_CHANGE_DURATION + 1);
      const targetWeights = normalizeWeights([
        targetWeight0,
        ...valueArray(
          ONE.sub(targetWeight0).div(this.poolTokens.length - 1),
          this.poolTokens.length - 1,
        ),
        ...startWeights.slice(this.poolTokens.length, this.tokens.length),
      ]);

      await expect(
        this.vault
          .connect(this.manager)
          .updateWeightsGradually(
            tokenWithValues(this.tokenAddresses, targetWeights),
            timestamp,
            timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1,
          ),
      ).to.be.revertedWith("Aera__WeightChangeRatioIsAboveMax");
    });

    it("when weight is less than minimum", async function () {
      const timestamp = await getCurrentTime();
      const token0TargetWeight = toWei(0.0091);
      const weights = await this.vault.getNormalizedWeights();
      const validDuration = normalizeWeights(
        weights.slice(0, this.poolTokens.length),
      )[0]
        .mul(ONE)
        .div(token0TargetWeight)
        .div(MAX_WEIGHT_CHANGE_RATIO)
        .add(10);
      const targetWeights = normalizeWeights([
        token0TargetWeight,
        ...valueArray(
          ONE.sub(token0TargetWeight).div(this.poolTokens.length - 1),
          this.poolTokens.length - 1,
        ),
        ...weights.slice(this.poolTokens.length, this.tokens.length),
      ]);

      await expect(
        this.vault
          .connect(this.manager)
          .updateWeightsGradually(
            tokenWithValues(this.tokenAddresses, targetWeights),
            timestamp,
            timestamp + validDuration.toNumber() + 1,
          ),
      ).to.be.revertedWith(BALANCER_ERRORS.MIN_WEIGHT);
    });
  });

  it("should be possible to call updateWeightsGradually", async function () {
    const startWeights = await this.vault.getNormalizedWeights();
    const startPoolWeights = normalizeWeights(
      startWeights.slice(0, this.poolTokens.length),
    );
    const timestamp = await getCurrentTime();
    const endWeights = [];
    const avgWeights = ONE.div(this.tokens.length);
    const startTime = timestamp + 10;
    const endTime = timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1000;
    for (let i = 0; i < this.tokens.length; i += 2) {
      if (i < this.tokens.length - 1) {
        endWeights.push(avgWeights.add(toWei((i + 1) / 100)));
        endWeights.push(avgWeights.sub(toWei((i + 1) / 100)));
      } else {
        endWeights.push(avgWeights);
      }
    }
    const endPoolWeights = normalizeWeights(
      normalizeWeights(endWeights).slice(0, this.poolTokens.length),
    );

    await this.vault
      .connect(this.manager)
      .updateWeightsGradually(
        tokenWithValues(this.tokenAddresses, normalizeWeights(endWeights)),
        startTime,
        endTime,
      );

    await increaseTime(MINIMUM_WEIGHT_CHANGE_DURATION);

    const currentWeights = await this.vault.getNormalizedWeights();
    const currentPoolWeights = normalizeWeights(
      currentWeights.slice(0, this.poolTokens.length),
    );

    const currentTime = await getCurrentTime();
    const ptcProgress = ONE.mul(currentTime - startTime).div(
      endTime - startTime,
    );

    for (let i = 0; i < this.poolTokens.length; i++) {
      const weightDelta = endPoolWeights[i]
        .sub(startPoolWeights[i])
        .mul(ptcProgress)
        .div(ONE);
      expect(startPoolWeights[i].add(weightDelta)).to.be.closeTo(
        currentPoolWeights[i],
        DEVIATION,
      );
    }
  });

  describe("should cancel current weight update", async function () {
    it("when deposit tokens", async function () {
      const timestamp = await getCurrentTime();
      const endWeights = [];
      const avgWeights = ONE.div(this.tokens.length);
      const startTime = timestamp + 10;
      const endTime = timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1000;
      for (let i = 0; i < this.tokens.length; i += 2) {
        if (i < this.tokens.length - 1) {
          endWeights.push(avgWeights.add(toWei((i + 1) / 100)));
          endWeights.push(avgWeights.sub(toWei((i + 1) / 100)));
        } else {
          endWeights.push(avgWeights);
        }
      }

      await this.vault
        .connect(this.manager)
        .updateWeightsGradually(
          tokenWithValues(this.tokenAddresses, normalizeWeights(endWeights)),
          startTime,
          endTime,
        );

      await this.vault.depositRiskingArbitrage(
        tokenValueArray(this.tokenAddresses, toWei(50), this.tokens.length),
      );

      const newWeights = await this.vault.getNormalizedWeights();

      for (let i = 0; i < 1000; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      const currentWeights = await this.vault.getNormalizedWeights();

      for (let i = 0; i < this.tokens.length; i++) {
        expect(newWeights[i]).to.equal(currentWeights[i]);
      }
    });

    it("when withdraw tokens", async function () {
      await this.validator.setAllowances(
        valueArray(toWei(100000), this.tokens.length),
      );
      await this.vault.depositRiskingArbitrage(
        tokenValueArray(this.tokenAddresses, toWei(50), this.tokens.length),
      );

      const timestamp = await getCurrentTime();
      const endWeights = [];
      const avgWeights = ONE.div(this.tokens.length);
      const startTime = timestamp + 10;
      const endTime = timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1000;
      for (let i = 0; i < this.tokens.length; i += 2) {
        if (i < this.tokens.length - 1) {
          endWeights.push(avgWeights.add(toWei((i + 1) / 100)));
          endWeights.push(avgWeights.sub(toWei((i + 1) / 100)));
        } else {
          endWeights.push(avgWeights);
        }
      }

      await this.vault
        .connect(this.manager)
        .updateWeightsGradually(
          tokenWithValues(this.tokenAddresses, normalizeWeights(endWeights)),
          startTime,
          endTime,
        );

      await this.vault.withdraw(
        tokenValueArray(this.tokenAddresses, toWei(50), this.tokens.length),
      );

      const newWeights = await this.vault.getNormalizedWeights();

      for (let i = 0; i < 1000; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      const currentWeights = await this.vault.getNormalizedWeights();

      for (let i = 0; i < this.tokens.length; i++) {
        expect(newWeights[i]).to.equal(currentWeights[i]);
      }
    });
  });
}
