import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import {
  MAX_ORACLE_DELAY,
  MAX_ORACLE_SPOT_DIVERGENCE,
  ONE,
  PRICE_DEVIATION,
} from "../../constants";
import {
  getCurrentTime,
  toWei,
  tokenValueArray,
  tokenWithValues,
  toUnit,
  valueArray,
} from "../../utils";

export function testDeposit(): void {
  describe("should be reverted to deposit tokens", async function () {
    it("when called from non-owner", async function () {
      await expect(
        this.vault
          .connect(this.signers.user)
          .deposit(
            tokenValueArray(this.tokenAddresses, ONE, this.tokens.length),
          ),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("when token and amount length is not same", async function () {
      await expect(
        this.vault.deposit(
          tokenValueArray(this.tokenAddresses, ONE, this.tokens.length + 1),
        ),
      ).to.be.revertedWith("Aera__ValueLengthIsNotSame");
    });

    it("when token is not sorted", async function () {
      await expect(
        this.vault.deposit(
          tokenValueArray(this.unsortedTokens, ONE, this.tokens.length),
        ),
      ).to.be.revertedWith("Aera__DifferentTokensInPosition");
    });

    it("when amount exceeds allowance", async function () {
      const spotPrices = await this.vault.getSpotPrices(this.sortedTokens[0]);
      for (let i = 1; i < this.poolTokens.length; i++) {
        await this.oracles[i].setLatestAnswer(spotPrices[i].div(1e10));
      }
      await expect(
        this.vault.deposit(
          tokenValueArray(this.tokenAddresses, toWei(100), this.tokens.length),
        ),
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("when oracle is disabled", async function () {
      const spotPrices = await this.vault.getSpotPrices(this.sortedTokens[0]);
      for (let i = 1; i < this.poolTokens.length; i++) {
        await this.oracles[i].setLatestAnswer(spotPrices[i].div(1e10));
      }

      const amounts = this.tokens.map(() =>
        toWei(Math.floor(10 + Math.random() * 10)),
      );

      for (let i = 0; i < this.tokens.length; i++) {
        await this.tokens[i].approve(this.vault.address, amounts[i]);
      }

      await this.vault.setOraclesEnabled(false);
      await expect(
        this.vault.deposit(tokenWithValues(this.tokenAddresses, amounts)),
      ).to.be.revertedWith("Aera__OraclesAreDisabled");
    });

    it("when oracle is delayed beyond maximum", async function () {
      const timestamp = await getCurrentTime();
      const spotPrices = await this.vault.getSpotPrices(this.sortedTokens[0]);
      for (let i = 1; i < this.poolTokens.length; i++) {
        await this.oracles[i].setLatestAnswer(spotPrices[i].div(1e10));
        await this.oracles[i].setUpdatedAt(timestamp - MAX_ORACLE_DELAY);
      }

      const amounts = this.tokens.map(() =>
        toWei(Math.floor(10 + Math.random() * 10)),
      );

      for (let i = 0; i < this.tokens.length; i++) {
        await this.tokens[i].approve(this.vault.address, amounts[i]);
      }

      await expect(
        this.vault.deposit(tokenWithValues(this.tokenAddresses, amounts)),
      ).to.be.revertedWith("Aera__OracleIsDelayedBeyondMax");
    });

    it("when oracle and spot price divergence exceeds maximum", async function () {
      const spotPrices = await this.vault.getSpotPrices(this.sortedTokens[0]);
      for (let i = 1; i < this.poolTokens.length; i++) {
        await this.oracles[i].setLatestAnswer(
          spotPrices[i]
            .mul(ONE)
            .div(MAX_ORACLE_SPOT_DIVERGENCE.add(1))
            .div(1e10),
        );
      }

      const amounts = this.tokens.map(() =>
        toWei(Math.floor(10 + Math.random() * 10)),
      );

      for (let i = 0; i < this.tokens.length; i++) {
        await this.tokens[i].approve(this.vault.address, amounts[i]);
      }

      await expect(
        this.vault.deposit(tokenWithValues(this.tokenAddresses, amounts)),
      ).to.be.revertedWith("Aera__OracleSpotPriceDivergenceExceedsMax");
    });

    it("when oracle price is not greater than zero", async function () {
      await this.oracles[1].setLatestAnswer(0);

      const amounts = this.tokens.map(() =>
        toWei(Math.floor(10 + Math.random() * 10)),
      );

      for (let i = 0; i < this.tokens.length; i++) {
        await this.tokens[i].approve(this.vault.address, amounts[i]);
      }

      await expect(
        this.vault.deposit(tokenWithValues(this.tokenAddresses, amounts)),
      ).to.be.revertedWith("Aera__OraclePriceIsInvalid");
    });

    it("when balance is changed in the same block", async function () {
      if (this.isForkTest) {
        const spotPrices = await this.vault.getSpotPrices(
          this.sortedTokens[0],
        );
        for (let i = 1; i < this.poolTokens.length; i++) {
          await this.oracles[i].setLatestAnswer(spotPrices[i].div(1e10));
        }

        const amounts = valueArray(toWei(0.1), this.tokens.length);

        await ethers.provider.send("evm_setAutomine", [false]);

        const trx1 = await this.vault.deposit(
          tokenWithValues(this.tokenAddresses, amounts),
        );
        const trx2 = await this.vault.depositIfBalanceUnchanged(
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
      }
    });
  });

  describe("should be possible to deposit tokens", async function () {
    it("when vault value is less than minimum", async function () {
      await this.validator.setAllowances(valueArray(ONE, this.tokens.length));
      await this.vault.withdraw(
        tokenValueArray(this.tokenAddresses, toWei(0.3), this.tokens.length),
      );

      const spotPrices = await this.vault.getSpotPrices(this.sortedTokens[0]);
      const oraclePrices: BigNumber[] = [toUnit(1, 8)];
      for (let i = 1; i < this.poolTokens.length; i++) {
        oraclePrices.push(
          spotPrices[i]
            .mul(ONE)
            .div(MAX_ORACLE_SPOT_DIVERGENCE.sub(toWei(0.05)))
            .div(1e10),
        );
        await this.oracles[i].setLatestAnswer(oraclePrices[i]);
      }

      const amounts = this.tokens.map(() =>
        toWei(Math.floor(10 + Math.random())),
      );

      for (let i = 0; i < this.tokens.length; i++) {
        await this.tokens[i].approve(this.vault.address, amounts[i]);
      }

      const trx = await this.vault.deposit(
        tokenWithValues(this.tokenAddresses, amounts),
      );

      const weights = await this.vault.getNormalizedWeights();

      await expect(trx)
        .to.emit(this.vault, "Deposit")
        .withArgs(amounts, amounts, weights);

      const newSpotPrices = await this.vault.getSpotPrices(
        this.sortedTokens[0],
      );

      for (let i = 1; i < this.poolTokens.length; i++) {
        expect(newSpotPrices[i]).to.be.closeTo(
          oraclePrices[i].mul(1e10),
          oraclePrices[i].mul(1e10).mul(PRICE_DEVIATION).div(ONE).toNumber(),
        );
      }
    });

    it("when deposit value is less than minimum", async function () {
      const spotPrices = await this.vault.getSpotPrices(this.sortedTokens[0]);
      const oraclePrices: BigNumber[] = [toUnit(1, 8)];
      for (let i = 1; i < this.poolTokens.length; i++) {
        oraclePrices.push(
          spotPrices[i]
            .mul(ONE)
            .div(MAX_ORACLE_SPOT_DIVERGENCE.sub(toWei(0.05)))
            .div(1e10),
        );
        await this.oracles[i].setLatestAnswer(oraclePrices[i]);
      }

      const amounts = this.tokens.map(() =>
        toWei(Math.floor(1 + Math.random())),
      );

      for (let i = 0; i < this.tokens.length; i++) {
        await this.tokens[i].approve(this.vault.address, amounts[i]);
      }

      const trx = await this.vault.deposit(
        tokenWithValues(this.tokenAddresses, amounts),
      );

      const weights = await this.vault.getNormalizedWeights();

      await expect(trx)
        .to.emit(this.vault, "Deposit")
        .withArgs(amounts, amounts, weights);

      const newSpotPrices = await this.vault.getSpotPrices(
        this.sortedTokens[0],
      );

      for (let i = 1; i < this.poolTokens.length; i++) {
        expect(newSpotPrices[i]).to.be.closeTo(
          spotPrices[i],
          spotPrices[i].mul(PRICE_DEVIATION).div(ONE).toNumber(),
        );
      }
    });

    it("when vault value and deposit value are greater than minimum", async function () {
      const spotPrices = await this.vault.getSpotPrices(this.sortedTokens[0]);
      const oraclePrices: BigNumber[] = [toUnit(1, 8)];
      for (let i = 1; i < this.poolTokens.length; i++) {
        oraclePrices.push(
          spotPrices[i]
            .mul(ONE)
            .div(MAX_ORACLE_SPOT_DIVERGENCE.sub(toWei(0.05)))
            .div(1e10),
        );
        await this.oracles[i].setLatestAnswer(oraclePrices[i]);
      }

      const amounts = this.tokens.map(() =>
        toWei(Math.floor(5 + Math.random() * 10)),
      );

      for (let i = 0; i < this.tokens.length; i++) {
        await this.tokens[i].approve(this.vault.address, amounts[i]);
      }

      const trx = await this.vault.deposit(
        tokenWithValues(this.tokenAddresses, amounts),
      );

      const weights = await this.vault.getNormalizedWeights();

      await expect(trx)
        .to.emit(this.vault, "Deposit")
        .withArgs(amounts, amounts, weights);

      const newSpotPrices = await this.vault.getSpotPrices(
        this.sortedTokens[0],
      );

      for (let i = 1; i < this.poolTokens.length; i++) {
        expect(newSpotPrices[i]).to.be.closeTo(
          oraclePrices[i].mul(1e10),
          oraclePrices[i].mul(1e10).mul(PRICE_DEVIATION).div(ONE).toNumber(),
        );
      }
    });
  });
}
