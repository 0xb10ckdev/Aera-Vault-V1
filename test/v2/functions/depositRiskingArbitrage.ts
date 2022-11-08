import { expect } from "chai";
import { ethers } from "hardhat";
import { ONE, PRICE_DEVIATION } from "../constants";
import { toWei, tokenValueArray, tokenWithValues } from "../utils";

export function testDepositRiskingArbitrage(): void {
  describe("should be reverted to deposit tokens", async function () {
    it("when called from non-owner", async function () {
      await expect(
        this.vault
          .connect(this.user)
          .depositRiskingArbitrage(
            tokenValueArray(this.tokenAddresses, ONE, this.tokens.length),
          ),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("when token and amount length is not same", async function () {
      await expect(
        this.vault.depositRiskingArbitrage(
          tokenValueArray(this.tokenAddresses, ONE, this.tokens.length + 1),
        ),
      ).to.be.revertedWith("Aera__ValueLengthIsNotSame");
    });

    it("when token is not sorted", async function () {
      await expect(
        this.vault.depositRiskingArbitrage(
          tokenValueArray(this.unsortedTokens, ONE, this.tokens.length),
        ),
      ).to.be.revertedWith("Aera__DifferentTokensInPosition");
    });

    it("when amount exceeds allowance", async function () {
      await expect(
        this.vault.depositRiskingArbitrage(
          tokenValueArray(this.tokenAddresses, toWei(100), this.tokens.length),
        ),
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("when balance is changed in the same block", async function () {
      const amounts = this.tokens.map(() =>
        toWei(Math.floor(10 + Math.random() * 10)),
      );

      await ethers.provider.send("evm_setAutomine", [false]);

      const trx1 = await this.vault.depositRiskingArbitrage(
        tokenWithValues(this.tokenAddresses, amounts),
      );
      const trx2 = await this.vault.depositRiskingArbitrageIfBalanceUnchanged(
        tokenWithValues(this.tokenAddresses, amounts),
      );

      await ethers.provider.send("evm_mine", []);

      try {
        await Promise.all([trx1.wait(), trx2.wait()]);
      } catch {
        // empty
      }

      const [receipt1, receipt2] = await Promise.all([
        ethers.provider.getTransactionReceipt(trx1.hash),
        ethers.provider.getTransactionReceipt(trx2.hash),
      ]);

      expect(receipt1.status).to.equal(1);
      expect(receipt2.status).to.equal(0);

      await ethers.provider.send("evm_setAutomine", [true]);
    });
  });

  describe("should be possible to deposit tokens", async function () {
    it("when depositing one token", async function () {
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
        const newManagersFeeTotal = await this.getManagersFeeTotal();

        const { holdings: newHoldings, adminBalances: newAdminBalances } =
          await this.getState();

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
        for (let j = 0; j < this.tokens.length; j++) {
          expect(newHoldings[j]).to.equal(
            holdings[j]
              .add(amounts[j])
              .sub(newManagersFeeTotal[j])
              .add(managersFeeTotal[j]),
          );
          expect(newAdminBalances[j]).to.equal(
            adminBalances[j].sub(amounts[j]),
          );
        }

        holdings = newHoldings;
        adminBalances = newAdminBalances;
        managersFeeTotal = newManagersFeeTotal;
      }
    });

    it("when depositing tokens", async function () {
      const { holdings, adminBalances } = await this.getState();

      const amounts = this.tokens.map(() =>
        toWei(Math.floor(10 + Math.random() * 10)),
      );

      const spotPrices = [];
      for (let i = 0; i < this.poolTokens.length; i++) {
        spotPrices.push(await this.vault.getSpotPrices(this.sortedTokens[i]));
      }
      for (let i = 0; i < this.tokens.length; i++) {
        await this.tokens[i].approve(this.vault.address, amounts[i]);
      }

      await this.vault.depositRiskingArbitrage(
        tokenWithValues(this.tokenAddresses, amounts),
      );
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
        expect(newHoldings[i]).to.equal(
          holdings[i].add(amounts[i]).sub(managersFeeTotal[i]),
        );
        expect(newAdminBalances[i]).to.equal(adminBalances[i].sub(amounts[i]));
      }
    });
  });
}
