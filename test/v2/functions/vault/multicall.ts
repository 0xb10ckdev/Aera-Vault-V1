import { expect } from "chai";
import { ethers } from "hardhat";
import {
  DEVIATION,
  MIN_SWAP_FEE,
  MINIMUM_WEIGHT_CHANGE_DURATION,
  ONE,
  PRICE_DEVIATION,
} from "../../constants";
import {
  getCurrentTime,
  increaseTime,
  normalizeWeights,
  tokenValueArray,
  tokenWithValues,
  toUnit,
  toWei,
  valueArray,
} from "../../utils";

export function testMulticall(): void {
  const ABI = [
    "function depositRiskingArbitrage(tuple(address token, uint256 value)[])",
    "function withdraw(tuple(address token, uint256 value)[])",
    "function updateWeightsGradually(tuple(address token, uint256 value)[], uint256 startTime, uint256 endTime)",
    "function disableTrading()",
    "function enableTradingRiskingArbitrage()",
    "function setSwapFee(uint256 newSwapFee)",
  ];
  const iface = new ethers.utils.Interface(ABI);

  describe("should be reverted", async function () {
    it("when data is invalid", async function () {
      await expect(this.vault.multicall(["0x"])).to.be.revertedWith(
        "Address: low-level delegate call failed",
      );
    });

    it("when vault not initialized", async function () {
      await expect(
        this.vault.multicall([iface.encodeFunctionData("disableTrading", [])]),
      ).to.be.revertedWith("Aera__VaultNotInitialized()");
    });

    it("when multicall ownable functions from non-owner", async function () {
      await expect(
        this.vault
          .connect(this.signers.user)
          .multicall([iface.encodeFunctionData("disableTrading", [])]),
      ).to.be.revertedWith("Aera__CallerIsNotOwnerOrManager()");
    });
  });

  describe("should be possible to multicall", async function () {
    beforeEach(async function () {
      for (let i = 0; i < this.tokens.length; i++) {
        await this.tokens[i].approve(this.vault.address, toWei(100000));
      }

      for (let i = 1; i < this.poolTokens.length; i++) {
        await this.oracles[i].setLatestAnswer(toUnit(1, 8));
      }

      await this.vault.initialDeposit(
        tokenValueArray(this.tokenAddresses, ONE, this.tokens.length),
        tokenWithValues(
          this.tokenAddresses,
          normalizeWeights(valueArray(ONE, this.tokens.length)),
        ),
      );
    });

    it("when disable trading, deposit and enable trading", async function () {
      const { holdings, adminBalances } = await this.getState();

      const amounts = this.tokens.map(() =>
        toWei(Math.floor(10 + Math.random() * 10)),
      );

      const spotPrices = [];
      for (let i = 0; i < this.poolTokens.length; i++) {
        spotPrices.push(await this.vault.getSpotPrices(this.sortedTokens[i]));
      }

      const trx = await this.vault.multicall([
        iface.encodeFunctionData("disableTrading", []),
        iface.encodeFunctionData("depositRiskingArbitrage", [
          tokenWithValues(this.tokenAddresses, amounts),
        ]),
        iface.encodeFunctionData("enableTradingRiskingArbitrage", []),
      ]);

      const weights = await this.vault.getNormalizedWeights();

      await expect(trx)
        .to.emit(this.vault, "SetSwapEnabled")
        .withArgs(false)
        .to.emit(this.vault, "Deposit")
        .withArgs(amounts, amounts, weights)
        .to.emit(this.vault, "SetSwapEnabled")
        .withArgs(true);

      expect(await this.vault.isSwapEnabled()).to.equal(true);

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
          expect(newSpotPrices[j]).to.be.closeTo(spotPrices[i][j], DEVIATION);
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

    it("when set swap fees and update weights", async function () {
      const newFee = MIN_SWAP_FEE.add(1);
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

      await expect(
        this.vault
          .connect(this.signers.manager)
          .multicall([
            iface.encodeFunctionData("setSwapFee", [newFee]),
            iface.encodeFunctionData("updateWeightsGradually", [
              tokenWithValues(
                this.tokenAddresses,
                normalizeWeights(endWeights),
              ),
              startTime,
              endTime,
            ]),
          ]),
      )
        .to.emit(this.vault, "SetSwapFee")
        .withArgs(newFee)
        .to.emit(this.vault, "UpdateWeightsGradually")
        .withArgs(startTime, endTime, normalizeWeights(endWeights));

      expect(
        await this.vault.connect(this.signers.manager).getSwapFee(),
      ).to.equal(newFee);

      await increaseTime(endTime - (await getCurrentTime()));

      const newWeights = await this.vault.getNormalizedWeights();

      for (let i = 0; i < this.tokens.length; i++) {
        expect(endWeights[i]).to.be.closeTo(newWeights[i], DEVIATION);
      }
    });

    it("when disable trading, withdraw and enable trading", async function () {
      await this.vault.depositRiskingArbitrage(
        tokenValueArray(this.tokenAddresses, toWei(10000), this.tokens.length),
      );

      const { holdings, adminBalances } = await this.getState();
      const managersFeeTotal = await this.getManagersFeeTotal();

      const amounts = this.tokens.map(() =>
        toWei(Math.floor(10 + Math.random() * 10)),
      );

      const spotPrices = [];
      for (let i = 0; i < this.poolTokens.length; i++) {
        spotPrices.push(await this.vault.getSpotPrices(this.sortedTokens[i]));
      }

      const trx = await this.vault.multicall([
        iface.encodeFunctionData("disableTrading", []),
        iface.encodeFunctionData("withdraw", [
          tokenWithValues(this.tokenAddresses, amounts),
        ]),
        iface.encodeFunctionData("enableTradingRiskingArbitrage", []),
      ]);

      const weights = await this.vault.getNormalizedWeights();

      await expect(trx)
        .to.emit(this.vault, "SetSwapEnabled")
        .withArgs(false)
        .to.emit(this.vault, "Withdraw")
        .withArgs(amounts, amounts, weights)
        .to.emit(this.vault, "SetSwapEnabled")
        .withArgs(true);

      expect(await this.vault.isSwapEnabled()).to.equal(true);

      const newManagersFeeTotal = await this.getManagersFeeTotal();

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
          holdings[i]
            .sub(amounts[i])
            .sub(newManagersFeeTotal[i])
            .add(managersFeeTotal[i]),
        );
        expect(newAdminBalances[i]).to.equal(adminBalances[i].add(amounts[i]));
      }
    });
  });
}
