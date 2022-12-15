import { expect } from "chai";
import { BigNumber } from "ethers";
import {
  BALANCER_ERRORS,
  DEVIATION,
  MAX_WEIGHT_CHANGE_RATIO,
  MIN_WEIGHT,
  MINIMUM_WEIGHT_CHANGE_DURATION,
  ONE,
} from "../../constants";
import {
  getCurrentTime,
  increaseTime,
  normalizeWeights,
  toWei,
  tokenValueArray,
  tokenWithValues,
  valueArray,
} from "../../utils";

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

    it("when token and weight length is not same", async function () {
      const timestamp = await getCurrentTime();
      await expect(
        this.vault
          .connect(this.signers.manager)
          .updateWeightsGradually(
            tokenWithValues(
              this.tokenAddresses,
              normalizeWeights(valueArray(ONE, this.tokens.length - 1)),
            ),
            timestamp + 10,
            timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 10,
          ),
      ).to.be.revertedWith("Aera__ValueLengthIsNotSame");
    });

    it("when token is not sorted", async function () {
      const timestamp = await getCurrentTime();
      await expect(
        this.vault
          .connect(this.signers.manager)
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

    it("when total sum of weights is not one", async function () {
      const timestamp = await getCurrentTime();
      await expect(
        this.vault
          .connect(this.signers.manager)
          .updateWeightsGradually(
            tokenValueArray(
              this.tokenAddresses,
              ONE.div(this.tokens.length).sub(1),
              this.tokens.length,
            ),
            timestamp + 10,
            timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 10,
          ),
      ).to.be.revertedWith("Aera__SumOfWeightIsNotOne");
    });

    it("when start time is greater than maximum", async function () {
      const timestamp = await getCurrentTime();
      await expect(
        this.vault
          .connect(this.signers.manager)
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
          .connect(this.signers.manager)
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
          .connect(this.signers.manager)
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
          .connect(this.signers.manager)
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
          .connect(this.signers.manager)
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
          .connect(this.signers.manager)
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
        .div(MAX_WEIGHT_CHANGE_RATIO + 10)
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
          .connect(this.signers.manager)
          .updateWeightsGradually(
            tokenWithValues(this.tokenAddresses, targetWeights),
            timestamp,
            timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1,
          ),
      ).to.be.revertedWith("Aera__WeightChangeRatioIsAboveMax");
    });

    it("when weight is less than minimum", async function () {
      const token0TargetWeight = toWei(0.009);
      const weights = await this.vault.getNormalizedWeights();
      const poolWeights = weights.slice(0, this.poolTokens.length);
      const normalizedPoolWeights = normalizeWeights(
        weights.slice(0, this.poolTokens.length),
      );
      let poolWeightSum = toWei(0);
      let normalizedPoolWeightSum = toWei(0);
      poolWeights.forEach(
        (weight: BigNumber) => (poolWeightSum = poolWeightSum.add(weight)),
      );
      normalizedPoolWeights.forEach(
        weight =>
          (normalizedPoolWeightSum = normalizedPoolWeightSum.add(weight)),
      );

      const validDuration = normalizedPoolWeights[0]
        .mul(ONE)
        .div(token0TargetWeight)
        .div(MAX_WEIGHT_CHANGE_RATIO)
        .add(10);
      const targetPoolWeights = [
        token0TargetWeight,
        ...valueArray(
          normalizedPoolWeightSum
            .sub(token0TargetWeight)
            .div(this.poolTokens.length - 1),
          this.poolTokens.length - 1,
        ),
      ];
      const targetWeights = normalizeWeights([
        ...targetPoolWeights.map(weight =>
          BigNumber.from(weight)
            .mul(poolWeightSum)
            .div(normalizedPoolWeightSum),
        ),
        ...weights.slice(this.poolTokens.length, this.tokens.length),
      ]);

      const timestamp = await getCurrentTime();

      await expect(
        this.vault
          .connect(this.signers.manager)
          .updateWeightsGradually(
            tokenWithValues(this.tokenAddresses, targetWeights),
            timestamp,
            timestamp + validDuration.toNumber() + 1,
          ),
      ).to.be.revertedWith(BALANCER_ERRORS.MIN_WEIGHT);
    });
  });

  describe("should be possible to call updateWeightsGradually", async function () {
    it("when no yield tokens should be adjusted", async function () {
      const startWeights = await this.vault.getNormalizedWeights();
      const startPoolWeights = normalizeWeights(
        startWeights.slice(0, this.poolTokens.length),
      );
      const timestamp = await getCurrentTime();
      const endWeights = [];
      const startTime = timestamp + 10;
      const endTime = timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1000;

      for (let i = 0; i < this.poolTokens.length; i += 2) {
        if (i < this.poolTokens.length - 1) {
          endWeights.push(startWeights[i].add(toWei((i + 1) / 100)));
          endWeights.push(startWeights[i + 1].sub(toWei((i + 1) / 100)));
        } else {
          endWeights.push(startWeights[i]);
        }
      }
      for (let i = this.poolTokens.length; i < this.tokens.length; i++) {
        endWeights.push(startWeights[i]);
      }

      const endPoolWeights = normalizeWeights(
        normalizeWeights(endWeights).slice(0, this.poolTokens.length),
      );

      await expect(
        this.vault
          .connect(this.signers.manager)
          .updateWeightsGradually(
            tokenWithValues(this.tokenAddresses, normalizeWeights(endWeights)),
            startTime,
            endTime,
          ),
      )
        .to.emit(this.vault, "UpdateWeightsGradually")
        .withArgs(startTime, endTime, normalizeWeights(endWeights));

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

    describe("when yield tokens should be adjusted", async function () {
      let startTime: number;
      let endTime: number;

      beforeEach(async function () {
        const timestamp = await getCurrentTime();
        startTime = timestamp + 10;
        endTime = timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 10000;
      });

      describe("when underlying tokens are enough to mint yield tokens", async function () {
        it("update weights of only underlying tokens and yield tokens", async function () {
          const weights = await this.vault.getNormalizedWeights();
          const targetWeights = [...weights];
          for (let i = 0; i < this.yieldTokens.length; i++) {
            targetWeights[this.underlyingIndexes[i]] = targetWeights[
              this.underlyingIndexes[i]
            ].sub(toWei(0.01));
            targetWeights[i + this.poolTokens.length] = targetWeights[
              i + this.poolTokens.length
            ].add(toWei(0.01));
          }

          await expect(
            this.vault
              .connect(this.signers.manager)
              .updateWeightsGradually(
                tokenWithValues(this.tokenAddresses, targetWeights),
                startTime,
                endTime,
              ),
          )
            .to.emit(this.vault, "UpdateWeightsGradually")
            .withArgs(startTime, endTime, targetWeights);

          const newWeights = await this.vault.getNormalizedWeights();

          for (let i = 0; i < this.tokens.length; i++) {
            expect(newWeights[i]).to.be.closeTo(targetWeights[i], DEVIATION);
          }
        });

        it("update weights of all tokens", async function () {
          const weights = await this.vault.getNormalizedWeights();
          let targetWeights = [...weights];
          for (let i = 0; i < this.yieldTokens.length; i++) {
            targetWeights[this.underlyingIndexes[i]] = targetWeights[
              this.underlyingIndexes[i]
            ].sub(toWei(0.01));
            targetWeights[i + this.poolTokens.length] = targetWeights[
              i + this.poolTokens.length
            ].add(toWei(0.01));
          }

          let weightSum = ONE;
          let numAdjustedWeight = 0;
          for (let i = 0; i < this.tokens.length; i++) {
            if (
              i > this.poolTokens.length ||
              this.underlyingIndexes.includes(i)
            ) {
              weightSum = weightSum.sub(targetWeights[i]);
              numAdjustedWeight++;
            }
          }
          for (let i = 0; i < this.poolTokens.length; i++) {
            if (!this.underlyingIndexes.includes(i)) {
              targetWeights[i] = weightSum.div(numAdjustedWeight);
            }
          }

          targetWeights = normalizeWeights(targetWeights);

          await expect(
            this.vault
              .connect(this.signers.manager)
              .updateWeightsGradually(
                tokenWithValues(this.tokenAddresses, targetWeights),
                startTime,
                endTime,
              ),
          )
            .to.emit(this.vault, "UpdateWeightsGradually")
            .withArgs(startTime, endTime, targetWeights);

          let newWeights = await this.vault.getNormalizedWeights();

          for (let i = 0; i < this.tokens.length; i++) {
            if (i >= this.poolTokens.length) {
              expect(newWeights[i]).to.be.closeTo(targetWeights[i], DEVIATION);
            } else if (!this.underlyingIndexes.includes(i)) {
              expect(newWeights[i]).to.be.closeTo(weights[i], DEVIATION);
            }
          }

          await increaseTime(endTime - (await getCurrentTime()));

          newWeights = await this.vault.getNormalizedWeights();

          for (let i = 0; i < this.tokens.length; i++) {
            expect(newWeights[i]).to.be.closeTo(targetWeights[i], DEVIATION);
          }
        });

        describe("when maximum deposit amount is low or invalid", async function () {
          let targetWeights: BigNumber[] = [];

          beforeEach(async function () {
            const weights = await this.vault.getNormalizedWeights();
            targetWeights = [...weights];
            for (let i = 0; i < this.yieldTokens.length; i++) {
              targetWeights[this.underlyingIndexes[i]] = targetWeights[
                this.underlyingIndexes[i]
              ].sub(toWei(0.02));
              targetWeights[i + this.poolTokens.length] = targetWeights[
                i + this.poolTokens.length
              ].add(toWei(0.02));
            }

            let weightSum = ONE;
            let numAdjustedWeight = 0;
            for (let i = 0; i < this.tokens.length; i++) {
              if (
                i > this.poolTokens.length ||
                this.underlyingIndexes.includes(i)
              ) {
                weightSum = weightSum.sub(targetWeights[i]);
                numAdjustedWeight++;
              }
            }
            for (let i = 0; i < this.poolTokens.length; i++) {
              if (!this.underlyingIndexes.includes(i)) {
                targetWeights[i] = weightSum.div(numAdjustedWeight);
              }
            }

            targetWeights = normalizeWeights(targetWeights);
          });

          it("deposit only maximum deposit amount", async function () {
            for (let i = 0; i < this.yieldTokens.length; i++) {
              await this.yieldTokens[i].setMaxDepositAmount(
                toWei(0.001),
                true,
              );
            }

            const holdings = await this.vault.getHoldings();

            await expect(
              this.vault
                .connect(this.signers.manager)
                .updateWeightsGradually(
                  tokenWithValues(this.tokenAddresses, targetWeights),
                  startTime,
                  endTime,
                ),
            )
              .to.emit(this.vault, "UpdateWeightsGradually")
              .withArgs(startTime, endTime, targetWeights);

            const newHoldings = await this.vault.getHoldings();

            for (let i = 0; i < this.tokens.length; i++) {
              if (this.underlyingIndexes.includes(i)) {
                expect(newHoldings[i]).to.equal(holdings[i].sub(toWei(0.001)));
              }
            }
          });

          it("deposit no assets when maximum deposit amount is zero", async function () {
            for (let i = 0; i < this.yieldTokens.length; i++) {
              await this.yieldTokens[i].setMaxDepositAmount(toWei(0), true);
            }

            const holdings = await this.vault.getHoldings();

            await expect(
              this.vault
                .connect(this.signers.manager)
                .updateWeightsGradually(
                  tokenWithValues(this.tokenAddresses, targetWeights),
                  startTime,
                  endTime,
                ),
            )
              .to.emit(this.vault, "UpdateWeightsGradually")
              .withArgs(startTime, endTime, targetWeights);

            const newHoldings = await this.vault.getHoldings();

            for (let i = 0; i < this.tokens.length; i++) {
              if (this.underlyingIndexes.includes(i)) {
                expect(newHoldings[i]).to.equal(holdings[i]);
              }
            }
          });

          it("deposit no assets when maxDeposit reverts", async function () {
            for (let i = 0; i < this.yieldTokens.length; i++) {
              await this.yieldTokens[i].pause();
            }

            const holdings = await this.vault.getHoldings();

            await expect(
              this.vault
                .connect(this.signers.manager)
                .updateWeightsGradually(
                  tokenWithValues(this.tokenAddresses, targetWeights),
                  startTime,
                  endTime,
                ),
            )
              .to.emit(this.vault, "UpdateWeightsGradually")
              .withArgs(startTime, endTime, targetWeights);

            const newHoldings = await this.vault.getHoldings();

            for (let i = 0; i < this.tokens.length; i++) {
              if (this.underlyingIndexes.includes(i)) {
                expect(newHoldings[i]).to.equal(holdings[i]);
              }
            }
          });
        });
      });

      it("when underlying tokens are not enough to mint yield tokens", async function () {
        const weights = await this.vault.getNormalizedWeights();
        let poolWeights = normalizeWeights(
          weights.slice(0, this.poolTokens.length),
        );
        let targetWeights = [...weights];
        for (let i = 0; i < this.yieldTokens.length; i++) {
          targetWeights[this.underlyingIndexes[i]] = toWei(0.1);
          targetWeights[i + this.poolTokens.length] = toWei(0.9);
          poolWeights[this.underlyingIndexes[i]] = MIN_WEIGHT;
        }

        targetWeights = normalizeWeights(targetWeights);
        poolWeights = normalizeWeights(poolWeights);

        await expect(
          this.vault
            .connect(this.signers.manager)
            .updateWeightsGradually(
              tokenWithValues(this.tokenAddresses, targetWeights),
              startTime,
              endTime,
            ),
        )
          .to.emit(this.vault, "UpdateWeightsGradually")
          .withArgs(startTime, endTime, targetWeights);

        let newWeights = await this.vault.getNormalizedWeights();
        const newPoolWeights = normalizeWeights(
          newWeights.slice(0, this.poolTokens.length),
        );

        for (let i = 0; i < this.poolTokens.length; i++) {
          expect(newPoolWeights[i]).to.be.closeTo(poolWeights[i], DEVIATION);
        }
        for (let i = 0; i < this.yieldTokens.length; i++) {
          expect(
            newWeights[i + this.poolTokens.length].add(
              newWeights[this.underlyingIndexes[i]],
            ),
          ).to.be.closeTo(
            weights[i + this.poolTokens.length].add(
              weights[this.underlyingIndexes[i]],
            ),
            DEVIATION,
          );
        }

        await increaseTime(endTime - (await getCurrentTime()));

        newWeights = await this.vault.getNormalizedWeights();

        for (let i = 0; i < this.yieldTokens.length; i++) {
          expect(
            newWeights[i + this.poolTokens.length].add(
              newWeights[this.underlyingIndexes[i]],
            ),
          ).to.be.closeTo(
            targetWeights[i + this.poolTokens.length].add(
              targetWeights[this.underlyingIndexes[i]],
            ),
            DEVIATION,
          );
        }
      });

      describe("when redeem yield tokens", async function () {
        it("update weights of only underlying tokens and yield tokens", async function () {
          const weights = await this.vault.getNormalizedWeights();
          const targetWeights = [...weights];
          for (let i = 0; i < this.yieldTokens.length; i++) {
            targetWeights[this.underlyingIndexes[i]] = targetWeights[
              this.underlyingIndexes[i]
            ].add(toWei(0.01));
            targetWeights[i + this.poolTokens.length] = targetWeights[
              i + this.poolTokens.length
            ].sub(toWei(0.01));
          }

          await expect(
            this.vault
              .connect(this.signers.manager)
              .updateWeightsGradually(
                tokenWithValues(this.tokenAddresses, targetWeights),
                startTime,
                endTime,
              ),
          )
            .to.emit(this.vault, "UpdateWeightsGradually")
            .withArgs(startTime, endTime, targetWeights);

          const newWeights = await this.vault.getNormalizedWeights();

          for (let i = 0; i < this.tokens.length; i++) {
            expect(newWeights[i]).to.be.closeTo(targetWeights[i], DEVIATION);
          }
        });

        it("update weights of all tokens", async function () {
          const weights = await this.vault.getNormalizedWeights();
          let targetWeights = [...weights];
          for (let i = 0; i < this.yieldTokens.length; i++) {
            targetWeights[this.underlyingIndexes[i]] = targetWeights[
              this.underlyingIndexes[i]
            ].add(toWei(0.01));
            targetWeights[i + this.poolTokens.length] = targetWeights[
              i + this.poolTokens.length
            ].sub(toWei(0.01));
          }

          let weightSum = ONE;
          let numAdjustedWeight = 0;
          for (let i = 0; i < this.tokens.length; i++) {
            if (
              i > this.poolTokens.length ||
              this.underlyingIndexes.includes(i)
            ) {
              weightSum = weightSum.sub(targetWeights[i]);
              numAdjustedWeight++;
            }
          }
          for (let i = 0; i < this.poolTokens.length; i++) {
            if (!this.underlyingIndexes.includes(i)) {
              targetWeights[i] = weightSum.div(numAdjustedWeight);
            }
          }

          targetWeights = normalizeWeights(targetWeights);

          await expect(
            this.vault
              .connect(this.signers.manager)
              .updateWeightsGradually(
                tokenWithValues(this.tokenAddresses, targetWeights),
                startTime,
                endTime,
              ),
          )
            .to.emit(this.vault, "UpdateWeightsGradually")
            .withArgs(startTime, endTime, targetWeights);

          let newWeights = await this.vault.getNormalizedWeights();

          for (let i = 0; i < this.tokens.length; i++) {
            if (i >= this.poolTokens.length) {
              expect(newWeights[i]).to.be.closeTo(targetWeights[i], DEVIATION);
            } else if (!this.underlyingIndexes.includes(i)) {
              expect(newWeights[i]).to.be.closeTo(weights[i], DEVIATION);
            }
          }

          await increaseTime(endTime - (await getCurrentTime()));

          newWeights = await this.vault.getNormalizedWeights();

          for (let i = 0; i < this.tokens.length; i++) {
            expect(newWeights[i]).to.be.closeTo(targetWeights[i], DEVIATION);
          }
        });

        describe("when maximum withdrawal amount is low or invalid", async function () {
          let targetWeights: BigNumber[] = [];

          beforeEach(async function () {
            const weights = await this.vault.getNormalizedWeights();
            targetWeights = [...weights];
            for (let i = 0; i < this.yieldTokens.length; i++) {
              targetWeights[this.underlyingIndexes[i]] = targetWeights[
                this.underlyingIndexes[i]
              ].add(toWei(0.02));
              targetWeights[i + this.poolTokens.length] = targetWeights[
                i + this.poolTokens.length
              ].sub(toWei(0.02));
            }

            let weightSum = ONE;
            let numAdjustedWeight = 0;
            for (let i = 0; i < this.tokens.length; i++) {
              if (
                i > this.poolTokens.length ||
                this.underlyingIndexes.includes(i)
              ) {
                weightSum = weightSum.sub(targetWeights[i]);
                numAdjustedWeight++;
              }
            }
            for (let i = 0; i < this.poolTokens.length; i++) {
              if (!this.underlyingIndexes.includes(i)) {
                targetWeights[i] = weightSum.div(numAdjustedWeight);
              }
            }

            targetWeights = normalizeWeights(targetWeights);
          });

          it("withdraw only maximum withdrawal amount", async function () {
            for (let i = 0; i < this.yieldTokens.length; i++) {
              await this.yieldTokens[i].setMaxWithdrawalAmount(
                toWei(0.001),
                true,
              );
            }

            const holdings = await this.vault.getHoldings();

            await expect(
              this.vault
                .connect(this.signers.manager)
                .updateWeightsGradually(
                  tokenWithValues(this.tokenAddresses, targetWeights),
                  startTime,
                  endTime,
                ),
            )
              .to.emit(this.vault, "UpdateWeightsGradually")
              .withArgs(startTime, endTime, targetWeights);

            const newHoldings = await this.vault.getHoldings();

            for (let i = 0; i < this.tokens.length; i++) {
              if (this.underlyingIndexes.includes(i)) {
                expect(newHoldings[i]).to.equal(holdings[i].add(toWei(0.001)));
              }
            }
          });

          it("withdraw no assets when maximum withdrawal amount is zero", async function () {
            for (let i = 0; i < this.yieldTokens.length; i++) {
              await this.yieldTokens[i].setMaxWithdrawalAmount(toWei(0), true);
            }

            const holdings = await this.vault.getHoldings();

            await expect(
              this.vault
                .connect(this.signers.manager)
                .updateWeightsGradually(
                  tokenWithValues(this.tokenAddresses, targetWeights),
                  startTime,
                  endTime,
                ),
            )
              .to.emit(this.vault, "UpdateWeightsGradually")
              .withArgs(startTime, endTime, targetWeights);

            const newHoldings = await this.vault.getHoldings();

            for (let i = 0; i < this.tokens.length; i++) {
              if (this.underlyingIndexes.includes(i)) {
                expect(newHoldings[i]).to.equal(holdings[i]);
              }
            }
          });

          it("withdraw no assets when maxWithdraw reverts", async function () {
            for (let i = 0; i < this.yieldTokens.length; i++) {
              await this.yieldTokens[i].pause();
            }

            const holdings = await this.vault.getHoldings();

            await expect(
              this.vault
                .connect(this.signers.manager)
                .updateWeightsGradually(
                  tokenWithValues(this.tokenAddresses, targetWeights),
                  startTime,
                  endTime,
                ),
            )
              .to.emit(this.vault, "UpdateWeightsGradually")
              .withArgs(startTime, endTime, targetWeights);

            const newHoldings = await this.vault.getHoldings();

            for (let i = 0; i < this.tokens.length; i++) {
              if (this.underlyingIndexes.includes(i)) {
                expect(newHoldings[i]).to.equal(holdings[i]);
              }
            }
          });
        });
      });
    });
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
        .connect(this.signers.manager)
        .updateWeightsGradually(
          tokenWithValues(this.tokenAddresses, normalizeWeights(endWeights)),
          startTime,
          endTime,
        );

      await this.vault.depositRiskingArbitrage(
        tokenValueArray(this.tokenAddresses, toWei(50), this.tokens.length),
      );

      const newWeights = await this.vault.getNormalizedWeights();

      await increaseTime(endTime - (await getCurrentTime()));

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
        .connect(this.signers.manager)
        .updateWeightsGradually(
          tokenWithValues(this.tokenAddresses, normalizeWeights(endWeights)),
          startTime,
          endTime,
        );

      await this.vault.withdraw(
        tokenValueArray(this.tokenAddresses, toWei(10), this.tokens.length),
      );

      const newWeights = await this.vault.getNormalizedWeights();

      await increaseTime(endTime - (await getCurrentTime()));

      const currentWeights = await this.vault.getNormalizedWeights();

      for (let i = 0; i < this.tokens.length; i++) {
        expect(newWeights[i]).to.equal(currentWeights[i]);
      }
    });
  });
}
