import { expect } from "chai";
import { BigNumber } from "ethers";
import { ONE, PRICE_DEVIATION } from "../../constants";
import { toWei, tokenWithValues } from "../../utils";

export function testDepositAndWithdraw(): void {
  it("should be possible to deposit and withdraw one token", async function () {
    let { holdings, adminBalances } = await this.getState();
    let managersFeeTotal = await this.getManagersFeeTotal();

    for (let i = 0; i < this.numTokens; i++) {
      const amounts = new Array(this.numTokens).fill(0);
      amounts[i] = toWei(5);

      const spotPrices =
        i < this.numPoolTokens
          ? await this.vault.getSpotPrices(this.sortedTokens[i])
          : [];

      await this.vault.depositRiskingArbitrage(
        tokenWithValues(this.tokenAddresses, amounts),
      );
      await this.vault.withdraw(tokenWithValues(this.tokenAddresses, amounts));
      const newManagersFeeTotal = await this.getManagersFeeTotal();

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
          holdings[j].sub(newManagersFeeTotal[j]).add(managersFeeTotal[j]),
        );

        if (
          i < this.numPoolTokens ||
          this.isWithdrawable[i - this.numPoolTokens]
        ) {
          expect(newAdminBalances[j]).to.equal(adminBalances[j]);
        } else {
          if (j == i) {
            expect(newAdminBalances[j]).to.equal(
              adminBalances[j].sub(amounts[j]),
            );
          } else if (j == this.underlyingIndexes[i - this.numPoolTokens]) {
            expect(newAdminBalances[j]).to.equal(
              adminBalances[j].add(amounts[i]),
            );
          } else {
            expect(newAdminBalances[j]).to.equal(adminBalances[j]);
          }
        }
      }

      holdings = newHoldings;
      adminBalances = newAdminBalances;
      managersFeeTotal = newManagersFeeTotal;
    }
  });

  it("should be possible to deposit and withdraw tokens", async function () {
    const { holdings, adminBalances } = await this.getState();

    const amounts = this.tokens.map(() =>
      toWei(Math.floor(10 + Math.random() * 10)),
    );

    const spotPrices = [];
    for (let i = 0; i < this.numPoolTokens; i++) {
      spotPrices.push(await this.vault.getSpotPrices(this.sortedTokens[i]));
    }

    await this.vault.depositRiskingArbitrage(
      tokenWithValues(this.tokenAddresses, amounts),
    );
    await this.vault.withdraw(tokenWithValues(this.tokenAddresses, amounts));
    const managersFeeTotal = await this.getManagersFeeTotal();

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
      expect(newHoldings[i]).to.equal(holdings[i].sub(managersFeeTotal[i]));
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
          adminBalances[i].add(poolTokenWithdrawnAmount),
        );
      } else if (this.isWithdrawable[i - this.numPoolTokens]) {
        expect(newAdminBalances[i]).to.equal(adminBalances[i]);
      } else {
        expect(newAdminBalances[i]).to.equal(adminBalances[i].sub(amounts[i]));
      }
    }
  });
}
