import { expect } from "chai";
import { BigNumber } from "ethers";
import { BALANCER_ERRORS, DEVIATION, ONE } from "../../constants";
import {
  normalizeWeights,
  toWei,
  tokenValueArray,
  tokenWithValues,
  toUnit,
  valueArray,
} from "../../utils";

export function testInitialDeposit(): void {
  beforeEach(async function () {
    for (let i = 0; i < this.numTokens; i++) {
      await this.tokens[i].approve(this.vault.address, toWei(2));
    }
  });

  describe("should be reverted to initialize the vault", async function () {
    it("when token and amount length is not same", async function () {
      await expect(
        this.vault.initialDeposit(
          tokenValueArray(this.tokenAddresses, ONE, this.numTokens + 1),
          tokenWithValues(
            this.tokenAddresses,
            normalizeWeights(valueArray(ONE, this.numTokens)),
          ),
        ),
      ).to.be.revertedWith("Aera__ValueLengthIsNotSame");
    });

    it("when token is not sorted", async function () {
      await expect(
        this.vault.initialDeposit(
          tokenValueArray(this.unsortedTokens, ONE, this.numTokens),
          tokenWithValues(
            this.tokenAddresses,
            normalizeWeights(valueArray(ONE, this.numTokens)),
          ),
        ),
      ).to.be.revertedWith("Aera__DifferentTokensInPosition");
    });

    it("when amount exceeds allowance", async function () {
      const validAmounts = tokenValueArray(
        this.tokenAddresses,
        ONE,
        this.numTokens,
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
            normalizeWeights(valueArray(ONE, this.numTokens)),
          ),
        ),
      ).to.be.revertedWith("ERC20: insufficient allowance");

      await expect(
        this.vault.initialDeposit(
          [
            ...validAmounts.slice(0, -1),
            {
              token: this.tokenAddresses[this.numTokens - 1],
              value: toWei(3),
            },
          ],
          tokenWithValues(
            this.tokenAddresses,
            normalizeWeights(valueArray(ONE, this.numTokens)),
          ),
        ),
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("when amount is zero", async function () {
      if (this.isForkTest) {
        const validAmounts = tokenValueArray(
          this.tokenAddresses,
          ONE,
          this.numTokens,
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
              normalizeWeights(valueArray(ONE, this.numTokens)),
            ),
          ),
        ).to.be.revertedWith(BALANCER_ERRORS.ZERO_INVARIANT);
      }
    });

    it("when vault is already initialized ", async function () {
      await this.vault.initialDeposit(
        tokenValueArray(this.tokenAddresses, ONE, this.numTokens),
        tokenWithValues(
          this.tokenAddresses,
          normalizeWeights(valueArray(ONE, this.numTokens)),
        ),
      );

      await expect(
        this.vault.initialDeposit(
          tokenValueArray(this.tokenAddresses, ONE, this.numTokens),
          tokenWithValues(
            this.tokenAddresses,
            normalizeWeights(valueArray(ONE, this.numTokens)),
          ),
        ),
      ).to.be.revertedWith("Aera__VaultIsAlreadyInitialized");
    });
  });

  it("should be possible to initialize the vault", async function () {
    for (let i = 0; i < this.numTokens; i++) {
      await this.tokens[i].approve(this.vault.address, toWei(10000));
    }

    const oraclePrices: BigNumber[] = [toUnit(1, 8)];
    for (let i = 1; i < this.numPoolTokens; i++) {
      oraclePrices.push(toWei(0.1 + Math.random()).div(1e10));
      await this.oracles[i].setLatestAnswer(oraclePrices[i]);
    }

    const amounts = this.tokens.map(() =>
      toWei(Math.floor(1000 + Math.random() * 5000)),
    );
    const normalizedWeights = normalizeWeights(
      valueArray(ONE, this.numTokens),
    );

    const balances = await this.getUserBalances(this.signers.admin.address);

    await this.vault.initialDeposit(
      tokenWithValues(this.tokenAddresses, amounts),
      tokenWithValues(this.tokenAddresses, normalizedWeights),
    );

    const { holdings, adminBalances: newAdminBalances } =
      await this.getState();

    const underlyingBalances = [];
    let totalValue = BigNumber.from(0);

    for (let i = 0; i < this.numTokens; i++) {
      if (i < this.numPoolTokens) {
        totalValue = totalValue.add(holdings[i].mul(oraclePrices[i]).div(1e8));
      } else {
        const index = i - this.numPoolTokens;
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
    for (let i = 0; i < this.numYieldTokens; i++) {
      const index = i + this.numPoolTokens;
      weights[index] = underlyingBalances[i]
        .mul(oraclePrices[this.underlyingIndexes[i]])
        .mul(1e10)
        .div(totalValue);
      sumYieldTokenWeights = sumYieldTokenWeights.add(weights[index]);
    }
    for (let i = 0; i < this.numPoolTokens; i++) {
      weights[i] = ONE.sub(sumYieldTokenWeights).div(this.numPoolTokens);
    }

    const newWeights = await this.vault.getNormalizedWeights();

    for (let i = 0; i < this.numTokens; i++) {
      expect(newAdminBalances[i]).to.equal(balances[i].sub(amounts[i]));
      expect(holdings[i]).to.equal(amounts[i]);
      expect(newWeights[i]).to.be.closeTo(weights[i], DEVIATION);
    }
  });
}
