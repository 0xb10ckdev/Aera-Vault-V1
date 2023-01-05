import { DEFAULT_ITM_OPTION_PRICE_RATIO } from "../constants";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { MockOToken } from "../../../../../typechain";
import { getCurrentTime, setNextBlockTimestamp, toUnit } from "../../../utils";
import {
  DEFAULT_PREMIUM,
  EXPIRY_DELTA_MIN,
  O_TOKEN_DECIMALS,
  PRICER_DECIMALS,
  USDC_DECIMALS,
} from "../constants";
import { adjustValue } from "../../../utils";
import { ONE } from "../../../constants";

export function shouldBehaveLikeTotalAssetsGetter(): void {
  const DEPOSIT_AMOUNT = toUnit(500, USDC_DECIMALS);
  const SPOT_PRICE = toUnit(1_000, USDC_DECIMALS);
  const STRIKE_PRICE = toUnit(850, USDC_DECIMALS);
  const O_TOKENS = toUnit(4, O_TOKEN_DECIMALS);
  const N = 3;
  let oTokens: MockOToken[];

  beforeEach(async function () {
    oTokens = [];
    await this.mocks.oTokenController.setCanSettleAssets(false);
    for (let i = 0; i < N; i++) {
      const { oToken } = await this.createAndFillBuyOrder(
        STRIKE_PRICE,
        (await getCurrentTime()) + EXPIRY_DELTA_MIN + 360 * (i + 1),
        DEPOSIT_AMOUNT,
        SPOT_PRICE,
        O_TOKENS,
      );
      oTokens.push(oToken);
    }
  });

  describe("when options not expired", function () {
    it("sums premium", async function () {
      expect(await this.putOptionsVault.totalAssets()).to.eq(
        adjustValue(
          DEFAULT_PREMIUM.mul(O_TOKENS)
            .mul(N)
            .div(BigNumber.from(10).pow(PRICER_DECIMALS)),
          O_TOKEN_DECIMALS,
          USDC_DECIMALS,
        ),
      );
    });
  });

  describe("when options expired", function () {
    beforeEach(async function () {
      await setNextBlockTimestamp(
        (await oTokens[oTokens.length - 1].expiryTimestamp())
          .add(1)
          .toNumber(),
      );
    });

    describe("when options price is not finalized", function () {
      describe("when options are ITM", function () {
        const PRICE_DIFF = toUnit(100, USDC_DECIMALS);
        const EXPIRY_PRICE = STRIKE_PRICE.sub(PRICE_DIFF);
        beforeEach(async function () {
          for (const oToken of oTokens) {
            await this.mocks.gammaOracle.setExpiryPrice(
              this.weth.address,
              await oToken.expiryTimestamp(),
              EXPIRY_PRICE,
            );
          }
        });

        it("sums expiry price using ITM ratio", async function () {
          expect(await this.putOptionsVault.totalAssets()).to.eq(
            // (100 USDC * 0.99) * oTokens / (ONE * 10^8)
            PRICE_DIFF.mul(DEFAULT_ITM_OPTION_PRICE_RATIO)
              .mul(O_TOKENS)
              .mul(N)
              .div(ONE.mul(BigNumber.from(10).pow(O_TOKEN_DECIMALS))),
          );
        });
      });

      describe("when options are OTM", function () {
        beforeEach(async function () {
          for (const oToken of oTokens) {
            await this.mocks.gammaOracle.setExpiryPrice(
              this.weth.address,
              await oToken.expiryTimestamp(),
              STRIKE_PRICE.add(1),
            );
          }
        });

        it("returns 0", async function () {
          expect(await this.putOptionsVault.totalAssets()).to.eq(0);
        });
      });
    });

    describe("when options price is finalized", function () {
      const PAYOUT = toUnit(100, USDC_DECIMALS);
      beforeEach(async function () {
        await this.mocks.oTokenController.setCanSettleAssets(true);

        await this.mocks.oTokenController.setPayout(PAYOUT);
      });

      it("sums payout", async function () {
        expect(await this.putOptionsVault.totalAssets()).to.eq(PAYOUT.mul(N));
      });
    });
  });
}
