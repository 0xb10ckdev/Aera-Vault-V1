import { expect } from "chai";
import { ONE, PRICE_DEVIATION } from "../../constants";
import { toWei, tokenWithValues } from "../../utils";

export function testDepositAndWithdraw(): void {
  it("should be possible to deposit and withdraw one token", async function () {
    let { holdings, adminBalances } = await this.getState();
    let managersFeeTotal = await this.getManagersFeeTotal();

    for (let i = 0; i < this.tokens.length; i++) {
      const amounts = new Array(this.tokens.length).fill(0);
      amounts[i] = toWei(5);

      const spotPrices =
        i < this.poolTokens.length
          ? await this.vault.getSpotPrices(this.sortedTokens[i])
          : [];

      await this.vault.depositRiskingArbitrage(
        tokenWithValues(this.tokenAddresses, amounts),
      );
      await this.vault.withdraw(tokenWithValues(this.tokenAddresses, amounts));
      const newManagersFeeTotal = await this.getManagersFeeTotal();

      if (i < this.poolTokens.length) {
        const newSpotPrices = await this.vault.getSpotPrices(
          this.sortedTokens[i],
        );
        for (let j = 0; j < this.poolTokens.length; j++) {
          expect(newSpotPrices[j]).to.closeTo(
            spotPrices[j],
            spotPrices[j].mul(PRICE_DEVIATION).div(ONE).toNumber(),
          );
        }
      }
      const { holdings: newHoldings, adminBalances: newAdminBalances } =
        await this.getState();

      for (let j = 0; j < this.tokens.length; j++) {
        expect(newHoldings[j]).to.equal(
          holdings[j].sub(newManagersFeeTotal[j]).add(managersFeeTotal[j]),
        );
        expect(newAdminBalances[j]).to.equal(adminBalances[j]);
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
    for (let i = 0; i < this.poolTokens.length; i++) {
      spotPrices.push(await this.vault.getSpotPrices(this.sortedTokens[i]));
    }

    await this.vault.depositRiskingArbitrage(
      tokenWithValues(this.tokenAddresses, amounts),
    );
    await this.vault.withdraw(tokenWithValues(this.tokenAddresses, amounts));
    const managersFeeTotal = await this.getManagersFeeTotal();

    const { holdings: newHoldings, adminBalances: newAdminBalances } =
      await this.getState();

    for (let i = 0; i < this.poolTokens.length; i++) {
      const newSpotPrices = await this.vault.getSpotPrices(
        this.sortedTokens[i],
      );

      expect(
        await this.vault.getSpotPrice(
          this.sortedTokens[i],
          this.sortedTokens[(i + 1) % this.poolTokens.length],
        ),
      ).to.equal(newSpotPrices[(i + 1) % this.poolTokens.length]);

      for (let j = 0; j < this.poolTokens.length; j++) {
        expect(newSpotPrices[j]).to.be.closeTo(
          spotPrices[i][j],
          spotPrices[i][j].mul(PRICE_DEVIATION).div(ONE).toNumber(),
        );
      }
    }
    for (let i = 0; i < this.tokens.length; i++) {
      expect(await this.vault.holding(i)).to.equal(newHoldings[i]);
      expect(newHoldings[i]).to.equal(holdings[i].sub(managersFeeTotal[i]));
      expect(newAdminBalances[i]).to.equal(adminBalances[i]);
    }
  });
}
