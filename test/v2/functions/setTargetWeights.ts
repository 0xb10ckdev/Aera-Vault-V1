import { expect } from "chai";
import { BigNumber } from "ethers";
import { DEVIATION, ONE } from "../constants";
import {
  increaseTime,
  normalizeWeights,
  toWei,
  tokenValueArray,
  tokenWithValues,
  valueArray,
} from "../utils";

export function testSetTargetWeights(): void {
  describe("should be reverted to call setTargetWeights", async function () {
    it("when called from non-owner", async function () {
      await expect(
        this.vault
          .connect(this.user)
          .setTargetWeights(
            tokenWithValues(
              this.tokenAddresses,
              normalizeWeights(valueArray(ONE, this.tokens.length)),
            ),
            100,
          ),
      ).to.be.revertedWith("Aera__CallerIsNotManager");
    });

    it("when token and weight length is not same", async function () {
      await expect(
        this.vault
          .connect(this.manager)
          .setTargetWeights(
            tokenWithValues(
              this.tokenAddresses,
              normalizeWeights(valueArray(ONE, this.tokens.length - 1)),
            ),
            100,
          ),
      ).to.be.revertedWith("Aera__ValueLengthIsNotSame");
    });

    it("when token is not sorted", async function () {
      await expect(
        this.vault
          .connect(this.manager)
          .setTargetWeights(
            tokenWithValues(
              this.unsortedTokens,
              normalizeWeights(valueArray(ONE, this.tokens.length)),
            ),
            100,
          ),
      ).to.be.revertedWith("Aera__DifferentTokensInPosition");
    });

    it("when total sum of weights is not one", async function () {
      await expect(
        this.vault
          .connect(this.manager)
          .setTargetWeights(
            tokenValueArray(
              this.tokenAddresses,
              ONE.div(this.tokens.length).sub(1),
              this.tokens.length,
            ),
            100,
          ),
      ).to.be.revertedWith("Aera__SumOfWeightIsNotOne");
    });
  });

  describe("should be possible to call setTargetWeights", async function () {
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

        await this.vault
          .connect(this.manager)
          .setTargetWeights(
            tokenWithValues(this.tokenAddresses, targetWeights),
            100,
          );

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

        await this.vault
          .connect(this.manager)
          .setTargetWeights(
            tokenWithValues(this.tokenAddresses, targetWeights),
            100,
          );

        let newWeights = await this.vault.getNormalizedWeights();

        for (let i = 0; i < this.tokens.length; i++) {
          if (i >= this.poolTokens.length) {
            expect(newWeights[i]).to.be.closeTo(targetWeights[i], DEVIATION);
          } else if (!this.underlyingIndexes.includes(i)) {
            expect(newWeights[i]).to.be.closeTo(weights[i], DEVIATION);
          }
        }

        await increaseTime(100);

        newWeights = await this.vault.getNormalizedWeights();

        for (let i = 0; i < this.tokens.length; i++) {
          expect(newWeights[i]).to.be.closeTo(targetWeights[i], DEVIATION);
        }
      });
    });

    it("when underlying tokens are not enough to mint yield tokens", async function () {
      const weights = await this.vault.getNormalizedWeights();
      let targetWeights = [...weights];
      for (let i = 0; i < this.yieldTokens.length; i++) {
        targetWeights[this.underlyingIndexes[i]] = toWei(0.1);
        targetWeights[i + this.poolTokens.length] = toWei(0.9);
      }
      for (let i = 0; i < this.poolTokens.length; i++) {
        if (!this.underlyingIndexes.includes(i)) {
          targetWeights[i] = toWei(0.1);
        }
      }

      targetWeights = normalizeWeights(targetWeights);

      await this.vault
        .connect(this.manager)
        .setTargetWeights(
          tokenWithValues(this.tokenAddresses, targetWeights),
          100,
        );

      let newWeights = await this.vault.getNormalizedWeights();

      for (let i = 0; i < this.tokens.length; i++) {
        expect(newWeights[i]).to.be.closeTo(weights[i], DEVIATION);
      }

      await increaseTime(100);

      newWeights = await this.vault.getNormalizedWeights();

      for (let i = 0; i < this.yieldTokens.length; i++) {
        expect(newWeights[i + this.poolTokens.length]).to.be.closeTo(
          weights[i + this.poolTokens.length],
          DEVIATION,
        );
        expect(newWeights[this.underlyingIndexes[i]]).to.be.closeTo(
          targetWeights[i + this.poolTokens.length]
            .add(targetWeights[this.underlyingIndexes[i]])
            .sub(weights[i + this.poolTokens.length]),
          DEVIATION,
        );
      }
      for (let i = 0; i < this.tokens.length; i++) {
        if (i >= this.poolTokens.length) {
          expect(newWeights[i]).to.be.closeTo(weights[i], DEVIATION);
          expect(
            newWeights[this.underlyingIndexes[i - this.poolTokens.length]],
          ).to.be.closeTo(
            targetWeights[i]
              .add(
                targetWeights[
                  this.underlyingIndexes[i - this.poolTokens.length]
                ],
              )
              .sub(weights[i]),
            DEVIATION,
          );
        } else if (!this.underlyingIndexes.includes(i)) {
          expect(newWeights[i]).to.be.closeTo(targetWeights[i], DEVIATION);
        }
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

        await this.vault
          .connect(this.manager)
          .setTargetWeights(
            tokenWithValues(this.tokenAddresses, targetWeights),
            100,
          );

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

        await this.vault
          .connect(this.manager)
          .setTargetWeights(
            tokenWithValues(this.tokenAddresses, targetWeights),
            100,
          );

        let newWeights = await this.vault.getNormalizedWeights();

        for (let i = 0; i < this.tokens.length; i++) {
          if (i >= this.poolTokens.length) {
            expect(newWeights[i]).to.be.closeTo(targetWeights[i], DEVIATION);
          } else if (!this.underlyingIndexes.includes(i)) {
            expect(newWeights[i]).to.be.closeTo(weights[i], DEVIATION);
          }
        }

        await increaseTime(100);

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

          await this.vault
            .connect(this.manager)
            .setTargetWeights(
              tokenWithValues(this.tokenAddresses, targetWeights),
              100,
            );

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

          await this.vault
            .connect(this.manager)
            .setTargetWeights(
              tokenWithValues(this.tokenAddresses, targetWeights),
              100,
            );

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

          await this.vault
            .connect(this.manager)
            .setTargetWeights(
              tokenWithValues(this.tokenAddresses, targetWeights),
              100,
            );

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
}
