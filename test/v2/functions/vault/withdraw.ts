import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { ONE, PRICE_DEVIATION } from "../../constants";
import { toWei, tokenValueArray, tokenWithValues } from "../../utils";

export function testWithdraw(): void {
  describe("should be reverted to withdraw tokens", async function () {
    it("when called from non-owner", async function () {
      await expect(
        this.vault
          .connect(this.signers.user)
          .withdraw(tokenValueArray(this.tokenAddresses, ONE, this.numTokens)),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("when token and amount length is not same", async function () {
      await expect(
        this.vault.withdraw(
          tokenValueArray(this.tokenAddresses, ONE, this.numTokens + 1),
        ),
      ).to.be.revertedWith("Aera__ValueLengthIsNotSame");
    });

    it("when token is not sorted", async function () {
      await expect(
        this.vault.withdraw(
          tokenValueArray(this.unsortedTokens, ONE, this.numTokens),
        ),
      ).to.be.revertedWith("Aera__DifferentTokensInPosition");
    });

    it("when amount exceeds holdings", async function () {
      const { holdings } = await this.getState();
      await expect(
        this.vault.withdraw([
          {
            token: this.tokenAddresses[0],
            value: holdings[0].add(1),
          },
          ...tokenValueArray(
            this.tokenAddresses.slice(1),
            ONE,
            this.numTokens - 1,
          ),
        ]),
      ).to.be.revertedWith("Aera__AmountExceedAvailable");
    });

    it("when balance is changed in the same block", async function () {
      if (this.isForkTest) {
        for (let i = 0; i < this.numTokens; i++) {
          await this.tokens[i].approve(this.vault.address, toWei(100000));
        }
        await this.vault.depositRiskingArbitrage(
          tokenValueArray(this.tokenAddresses, toWei(10000), this.numTokens),
        );

        const amounts = this.tokens.map(() =>
          toWei(Math.floor(10 + Math.random() * 10)),
        );

        await ethers.provider.send("evm_setAutomine", [false]);

        const trx1 = await this.vault.withdraw(
          tokenWithValues(this.tokenAddresses, amounts),
        );
        const trx2 = await this.vault.withdrawIfBalanceUnchanged(
          tokenWithValues(this.tokenAddresses, amounts),
        );

        await ethers.provider.send("evm_mine", []);

        try {
          await Promise.all([trx1.wait(), trx2.wait()]);
        } catch (e) {
          // empty
        }

        const [receipt1, receipt2] = await Promise.all([
          ethers.provider.getTransactionReceipt(trx1.hash),
          ethers.provider.getTransactionReceipt(trx2.hash),
        ]);

        expect(receipt1.status).to.equal(1);
        expect(receipt2.status).to.equal(0);

        await ethers.provider.send("evm_setAutomine", [true]);
      }
    });
  });

  describe("should be possible to withdraw ", async function () {
    it("when withdrawing one token", async function () {
      await this.vault.depositRiskingArbitrage(
        tokenValueArray(this.tokenAddresses, toWei(5), this.numTokens),
      );
      let { holdings, adminBalances } = await this.getState();
      let guardiansFeeTotal = await this.getGuardiansFeeTotal();

      for (let i = 0; i < this.numTokens; i++) {
        const amounts = new Array(this.numTokens).fill(0);
        amounts[i] = toWei(5);

        const spotPrices =
          i < this.numPoolTokens
            ? await this.vault.getSpotPrices(this.sortedTokens[i])
            : [];

        const trx = await this.vault.withdraw(
          tokenWithValues(this.tokenAddresses, amounts),
        );

        const weights = await this.vault.getNormalizedWeights();

        await expect(trx)
          .to.emit(this.vault, "Withdraw")
          .withArgs(amounts, amounts, weights);

        const newGuardiansFeeTotal = await this.getGuardiansFeeTotal();

        if (i < this.numPoolTokens) {
          const newSpotPrices = await this.vault.getSpotPrices(
            this.sortedTokens[i],
          );
          for (let j = 0; j < this.numPoolTokens; j++) {
            expect(newSpotPrices[j]).to.closeTo(
              spotPrices[j],
              spotPrices[j].mul(PRICE_DEVIATION).div(ONE).toNumber(),
            );
          }
        }

        const { holdings: newHoldings, adminBalances: newAdminBalances } =
          await this.getState();

        for (let j = 0; j < this.numTokens; j++) {
          expect(newHoldings[j]).to.equal(
            holdings[j]
              .sub(amounts[j])
              .sub(newGuardiansFeeTotal[j])
              .add(guardiansFeeTotal[j]),
          );

          if (
            i < this.numPoolTokens ||
            this.isWithdrawable[i - this.numPoolTokens]
          ) {
            expect(newAdminBalances[j]).to.equal(
              adminBalances[j].add(amounts[j]),
            );
          } else {
            if (j == i) {
              expect(newAdminBalances[j]).to.equal(adminBalances[j]);
            } else if (j == this.underlyingIndexes[i - this.numPoolTokens]) {
              expect(newAdminBalances[j]).to.equal(
                adminBalances[j].add(amounts[j]).add(amounts[i]),
              );
            } else {
              expect(newAdminBalances[j]).to.equal(
                adminBalances[j].add(amounts[j]),
              );
            }
          }
        }

        holdings = newHoldings;
        adminBalances = newAdminBalances;
        guardiansFeeTotal = newGuardiansFeeTotal;
      }
    });

    it("when withdrawing tokens", async function () {
      for (let i = 0; i < this.numTokens; i++) {
        await this.tokens[i].approve(this.vault.address, toWei(100000));
      }
      await this.vault.depositRiskingArbitrage(
        tokenValueArray(this.tokenAddresses, toWei(10000), this.numTokens),
      );

      const { holdings, adminBalances } = await this.getState();
      const guardiansFeeTotal = await this.getGuardiansFeeTotal();

      const amounts = this.tokens.map(() =>
        toWei(Math.floor(10 + Math.random() * 10)),
      );

      const spotPrices = [];
      for (let i = 0; i < this.numPoolTokens; i++) {
        spotPrices.push(await this.vault.getSpotPrices(this.sortedTokens[i]));
      }

      const trx = await this.vault.withdraw(
        tokenWithValues(this.tokenAddresses, amounts),
      );

      const weights = await this.vault.getNormalizedWeights();

      await expect(trx)
        .to.emit(this.vault, "Withdraw")
        .withArgs(amounts, amounts, weights);

      const newGuardiansFeeTotal = await this.getGuardiansFeeTotal();

      const { holdings: newHoldings, adminBalances: newAdminBalances } =
        await this.getState();

      for (let i = 0; i < this.numPoolTokens; i++) {
        const newSpotPrices = await this.vault.getSpotPrices(
          this.sortedTokens[i],
        );

        expect(
          await this.vault.getSpotPrice(
            this.sortedTokens[i],
            this.sortedTokens[(i + 1) % this.numPoolTokens],
          ),
        ).to.equal(newSpotPrices[(i + 1) % this.numPoolTokens]);

        for (let j = 0; j < this.numPoolTokens; j++) {
          expect(newSpotPrices[j]).to.be.closeTo(
            spotPrices[i][j],
            spotPrices[i][j].mul(PRICE_DEVIATION).div(ONE).toNumber(),
          );
        }
      }
      for (let i = 0; i < this.numTokens; i++) {
        expect(await this.vault.holding(i)).to.equal(newHoldings[i]);
        expect(newHoldings[i]).to.equal(
          holdings[i]
            .sub(amounts[i])
            .sub(newGuardiansFeeTotal[i])
            .add(guardiansFeeTotal[i]),
        );
        if (i < this.numPoolTokens) {
          let poolTokenWithdrawnAmount = BigNumber.from(0);
          for (let j = 0; j < this.numYieldTokens; j++) {
            if (this.underlyingIndexes[j] == i && !this.isWithdrawable[j]) {
              poolTokenWithdrawnAmount = poolTokenWithdrawnAmount.add(
                amounts[j + this.numPoolTokens],
              );
            }
          }
          expect(newAdminBalances[i]).to.equal(
            adminBalances[i].add(amounts[i]).add(poolTokenWithdrawnAmount),
          );
        } else if (this.isWithdrawable[i - this.numPoolTokens]) {
          expect(newAdminBalances[i]).to.equal(
            adminBalances[i].add(amounts[i]),
          );
        } else {
          expect(newAdminBalances[i]).to.equal(adminBalances[i]);
        }
      }
    });

    it("when withdrawing tokens with withdrawIfBalanceUnchanged", async function () {
      for (let i = 0; i < this.numTokens; i++) {
        await this.tokens[i].approve(this.vault.address, toWei(100000));
      }
      await this.vault.depositRiskingArbitrage(
        tokenValueArray(this.tokenAddresses, toWei(10000), this.numTokens),
      );

      const { holdings, adminBalances } = await this.getState();
      const guardiansFeeTotal = await this.getGuardiansFeeTotal();

      const amounts = this.tokens.map(() =>
        toWei(Math.floor(10 + Math.random() * 10)),
      );

      const spotPrices = [];
      for (let i = 0; i < this.numPoolTokens; i++) {
        spotPrices.push(await this.vault.getSpotPrices(this.sortedTokens[i]));
      }

      const trx = await this.vault.withdraw(
        tokenWithValues(this.tokenAddresses, amounts),
      );

      const weights = await this.vault.getNormalizedWeights();

      await expect(trx)
        .to.emit(this.vault, "Withdraw")
        .withArgs(amounts, amounts, weights);

      const newGuardiansFeeTotal = await this.getGuardiansFeeTotal();

      const { holdings: newHoldings, adminBalances: newAdminBalances } =
        await this.getState();

      for (let i = 0; i < this.numPoolTokens; i++) {
        const newSpotPrices = await this.vault.getSpotPrices(
          this.sortedTokens[i],
        );

        expect(
          await this.vault.getSpotPrice(
            this.sortedTokens[i],
            this.sortedTokens[(i + 1) % this.numPoolTokens],
          ),
        ).to.equal(newSpotPrices[(i + 1) % this.numPoolTokens]);

        for (let j = 0; j < this.numPoolTokens; j++) {
          expect(newSpotPrices[j]).to.be.closeTo(
            spotPrices[i][j],
            spotPrices[i][j].mul(PRICE_DEVIATION).div(ONE).toNumber(),
          );
        }
      }
      for (let i = 0; i < this.numTokens; i++) {
        expect(await this.vault.holding(i)).to.equal(newHoldings[i]);
        expect(newHoldings[i]).to.equal(
          holdings[i]
            .sub(amounts[i])
            .sub(newGuardiansFeeTotal[i])
            .add(guardiansFeeTotal[i]),
        );
        if (i < this.numPoolTokens) {
          let poolTokenWithdrawnAmount = BigNumber.from(0);
          for (let j = 0; j < this.numYieldTokens; j++) {
            if (this.underlyingIndexes[j] == i && !this.isWithdrawable[j]) {
              poolTokenWithdrawnAmount = poolTokenWithdrawnAmount.add(
                amounts[j + this.numPoolTokens],
              );
            }
          }
          expect(newAdminBalances[i]).to.equal(
            adminBalances[i].add(amounts[i]).add(poolTokenWithdrawnAmount),
          );
        } else if (this.isWithdrawable[i - this.numPoolTokens]) {
         expect(newAdminBalances[i]).to.equal(
            adminBalances[i].add(amounts[i]),
          );
        } else {
          expect(newAdminBalances[i]).to.equal(adminBalances[i]);
        }
      }
    });
  });
}
