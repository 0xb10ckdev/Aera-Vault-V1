import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { BALANCER_ERRORS, DEVIATION, ONE } from "../constants";
import {
  normalizeWeights,
  toWei,
  tokenValueArray,
  tokenWithValues,
  toUnit,
  valueArray,
} from "../utils";

export function testInitialDeposit(): void {
  beforeEach(async function () {
    for (let i = 0; i < this.tokens.length; i++) {
      await this.tokens[i].approve(this.vault.address, toWei(2));
    }
  });

  describe("should be reverted to call functions", async function () {
    it("when call deposit", async function () {
      await expect(
        this.vault.deposit(
          tokenValueArray(this.tokenAddresses, ONE, this.tokens.length),
        ),
      ).to.be.revertedWith("Aera__VaultNotInitialized");
    });

    it("when call depositIfBalanceUnchanged", async function () {
      await expect(
        this.vault.depositIfBalanceUnchanged(
          tokenValueArray(this.tokenAddresses, ONE, this.tokens.length),
        ),
      ).to.be.revertedWith("Aera__VaultNotInitialized");
    });

    it("when call depositRiskingArbitrage", async function () {
      await expect(
        this.vault.depositRiskingArbitrage(
          tokenValueArray(this.tokenAddresses, ONE, this.tokens.length),
        ),
      ).to.be.revertedWith("Aera__VaultNotInitialized");
    });

    it("when call depositRiskingArbitrageIfBalanceUnchanged", async function () {
      await expect(
        this.vault.depositRiskingArbitrageIfBalanceUnchanged(
          tokenValueArray(this.tokenAddresses, ONE, this.tokens.length),
        ),
      ).to.be.revertedWith("Aera__VaultNotInitialized");
    });

    it("when call withdraw", async function () {
      await expect(
        this.vault.withdraw(
          tokenValueArray(this.tokenAddresses, ONE, this.tokens.length),
        ),
      ).to.be.revertedWith("Aera__VaultNotInitialized");
    });

    it("when call withdrawIfBalanceUnchanged", async function () {
      await expect(
        this.vault.withdrawIfBalanceUnchanged(
          tokenValueArray(this.tokenAddresses, ONE, this.tokens.length),
        ),
      ).to.be.revertedWith("Aera__VaultNotInitialized");
    });

    it("when call updateWeightsGradually", async function () {
      const blocknumber = await ethers.provider.getBlockNumber();
      await expect(
        this.vault
          .connect(this.manager)
          .updateWeightsGradually(
            tokenWithValues(
              this.tokenAddresses,
              normalizeWeights(valueArray(ONE, this.tokens.length)),
            ),
            blocknumber + 1,
            blocknumber + 1000,
          ),
      ).to.be.revertedWith("Aera__VaultNotInitialized");
    });

    it("when call cancelWeightUpdates", async function () {
      await expect(
        this.vault.connect(this.manager).cancelWeightUpdates(),
      ).to.be.revertedWith("Aera__VaultNotInitialized");
    });

    it("when call claimManagerFees", async function () {
      await expect(
        this.vault.connect(this.manager).claimManagerFees(),
      ).to.be.revertedWith("Aera__VaultNotInitialized");
    });

    it("when call finalize", async function () {
      await expect(this.vault.finalize()).to.be.revertedWith(
        "Aera__VaultNotInitialized",
      );
    });
  });

  describe("should be reverted to initialize the vault", async function () {
    it("when token and amount length is not same", async function () {
      await expect(
        this.vault.initialDeposit(
          tokenValueArray(this.tokenAddresses, ONE, this.tokens.length + 1),
          tokenWithValues(
            this.tokenAddresses,
            normalizeWeights(valueArray(ONE, this.tokens.length)),
          ),
        ),
      ).to.be.revertedWith("Aera__ValueLengthIsNotSame");
    });

    it("when token is not sorted", async function () {
      await expect(
        this.vault.initialDeposit(
          tokenValueArray(this.unsortedTokens, ONE, this.tokens.length),
          tokenWithValues(
            this.tokenAddresses,
            normalizeWeights(valueArray(ONE, this.tokens.length)),
          ),
        ),
      ).to.be.revertedWith("Aera__DifferentTokensInPosition");
    });

    it("when amount exceeds allowance", async function () {
      const validAmounts = tokenValueArray(
        this.tokenAddresses,
        ONE,
        this.tokens.length,
      );

      await expect(
        this.vault.initialDeposit(
          [
            {
              token: this.sortedTokens[0],
              value: toWei(3),
            },
            ...validAmounts.slice(1),
          ],
          tokenWithValues(
            this.tokenAddresses,
            normalizeWeights(valueArray(ONE, this.tokens.length)),
          ),
        ),
      ).to.be.revertedWith("ERC20: insufficient allowance");

      await expect(
        this.vault.initialDeposit(
          [
            ...validAmounts.slice(0, -1),
            {
              token: this.tokenAddresses[this.tokens.length - 1],
              value: toWei(3),
            },
          ],
          tokenWithValues(
            this.tokenAddresses,
            normalizeWeights(valueArray(ONE, this.tokens.length)),
          ),
        ),
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("when amount is zero", async function () {
      const validAmounts = tokenValueArray(
        this.tokenAddresses,
        ONE,
        this.tokens.length,
      );

      await expect(
        this.vault.initialDeposit(
          [
            {
              token: this.tokenAddresses[0],
              value: 0,
            },
            ...validAmounts.slice(1),
          ],
          tokenWithValues(
            this.tokenAddresses,
            normalizeWeights(valueArray(ONE, this.tokens.length)),
          ),
        ),
      ).to.be.revertedWith(BALANCER_ERRORS.ZERO_INVARIANT);
    });
  });

  it("should be possible to initialize the vault", async function () {
    for (let i = 0; i < this.tokens.length; i++) {
      await this.tokens[i].approve(this.vault.address, toWei(10000));
    }

    const oraclePrices: BigNumber[] = [toUnit(1, 8)];
    for (let i = 1; i < this.poolTokens.length; i++) {
      oraclePrices.push(toWei(0.1 + Math.random()).div(1e10));
      await this.oracles[i].setLatestAnswer(oraclePrices[i]);
    }

    const amounts = this.tokens.map(() =>
      toWei(Math.floor(1000 + Math.random() * 5000)),
    );
    const normalizedWeights = normalizeWeights(
      valueArray(ONE, this.tokens.length),
    );

    const balances = await this.getUserBalances(this.admin.address);

    await this.vault.initialDeposit(
      tokenWithValues(this.tokenAddresses, amounts),
      tokenWithValues(this.tokenAddresses, normalizedWeights),
    );

    const { holdings, adminBalances: newAdminBalances } =
      await this.getState();

    const underlyingBalances = [];
    let totalValue = BigNumber.from(0);

    for (let i = 0; i < this.tokens.length; i++) {
      if (i < this.poolTokens.length) {
        totalValue = totalValue.add(holdings[i].mul(oraclePrices[i]).div(1e8));
      } else {
        const index = i - this.poolTokens.length;
        underlyingBalances[index] = await this.yieldTokens[
          index
        ].convertToAssets(holdings[i]);
        totalValue = totalValue.add(
          underlyingBalances[index]
            .mul(oraclePrices[this.underlyingIndexes[index]])
            .div(1e8),
        );
      }
    }

    const weights = this.tokens.map(() => BigNumber.from(0));
    let sumYieldTokenWeights = BigNumber.from(0);
    for (let i = 0; i < this.yieldTokens.length; i++) {
      const index = i + this.poolTokens.length;
      weights[index] = underlyingBalances[i]
        .mul(oraclePrices[this.underlyingIndexes[i]])
        .mul(1e10)
        .div(totalValue);
      sumYieldTokenWeights = sumYieldTokenWeights.add(weights[index]);
    }
    for (let i = 0; i < this.poolTokens.length; i++) {
      weights[i] = ONE.sub(sumYieldTokenWeights).div(this.poolTokens.length);
    }

    const newWeights = await this.vault.getNormalizedWeights();

    for (let i = 0; i < this.tokens.length; i++) {
      expect(newAdminBalances[i]).to.equal(balances[i].sub(amounts[i]));
      expect(holdings[i]).to.equal(amounts[i]);
      expect(newWeights[i]).to.be.closeTo(weights[i], DEVIATION);
    }
  });
}
