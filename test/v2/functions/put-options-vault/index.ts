import { shouldBehaveLikePutOptionsVaultDeployment } from "./deployment";
import {
  shouldBehaveLikeCancelBuyOrder,
  shouldBehaveLikeCancelSellOrder,
  shouldBehaveLikeCheckExpired,
  shouldBehaveLikeDeposit,
  shouldBehaveLikeFillBuyOrder,
  shouldBehaveLikeFillSellOrder,
  shouldBehaveLikeSell,
  shouldBehaveLikeSetExpiryDelta,
  shouldBehaveLikeSetITMOptionPriceRatio,
  shouldBehaveLikeSetOptionPremiumDiscount,
  shouldBehaveLikeSetStrikeMultiplier,
} from "./effects";
import {
  shouldBehaveLikeAssetGetter,
  shouldBehaveLikeBrokerGetter,
  shouldBehaveLikeBuyOrderGetter,
  shouldBehaveLikeControllerGetter,
  shouldBehaveLikeExpiryDeltaGetter,
  shouldBehaveLikeItmOptionPriceRatioGetter,
  shouldBehaveLikeLiquidatorGetter,
  shouldBehaveLikeMaxDepositGetter,
  shouldBehaveLikeMaxMintGetter,
  shouldBehaveLikeOptionsPremiumDiscountGetter,
  shouldBehaveLikePositionsGetter,
  shouldBehaveLikePricerGetter,
  shouldBehaveLikeSellOrderGetter,
  shouldBehaveLikeStrikeMultiplierGetter,
  shouldBehaveLikeTotalAssetsGetter,
  shouldBehaveLikeUnderlyingOptionsAssetGetter,
} from "./view";

export function shouldBehaveLikePutOptionsVault(): void {
  describe.only("Put Options Vault", function () {
    describe("Deployment", function () {
      shouldBehaveLikePutOptionsVaultDeployment();
    });

    describe("View functions", function () {
      describe("broker", function () {
        shouldBehaveLikeBrokerGetter();
      });

      describe("controller", function () {
        shouldBehaveLikeControllerGetter();
      });

      describe("liquidator", function () {
        shouldBehaveLikeLiquidatorGetter();
      });

      describe("positions", function () {
        shouldBehaveLikePositionsGetter();
      });

      describe("underlyingOptionsAsset", function () {
        shouldBehaveLikeUnderlyingOptionsAssetGetter();
      });

      describe("asset", function () {
        shouldBehaveLikeAssetGetter();
      });

      describe("pricer", function () {
        shouldBehaveLikePricerGetter();
      });

      describe("buyOrder", function () {
        shouldBehaveLikeBuyOrderGetter();
      });

      describe("sellOrder", function () {
        shouldBehaveLikeSellOrderGetter();
      });

      describe("expiryDelta", function () {
        shouldBehaveLikeExpiryDeltaGetter();
      });

      describe("strikeMultiplier", function () {
        shouldBehaveLikeStrikeMultiplierGetter();
      });

      describe("optionsPremiumDiscount", function () {
        shouldBehaveLikeOptionsPremiumDiscountGetter();
      });

      describe("itmOptionPriceRatio", function () {
        shouldBehaveLikeItmOptionPriceRatioGetter();
      });

      describe("maxDeposit", function () {
        shouldBehaveLikeMaxDepositGetter();
      });

      describe("maxMint", function () {
        shouldBehaveLikeMaxMintGetter();
      });

      describe("totalAssets", function () {
        shouldBehaveLikeTotalAssetsGetter();
      });
    });

    describe("Effects functions", function () {
      describe("checkExpired", function () {
        shouldBehaveLikeCheckExpired();
      });

      describe("sell", function () {
        shouldBehaveLikeSell();
      });

      describe("setExpiryDelta", function () {
        shouldBehaveLikeSetExpiryDelta();
      });

      describe("setStrikeMultiplier", function () {
        shouldBehaveLikeSetStrikeMultiplier();
      });

      describe("fillBuyOrder", function () {
        shouldBehaveLikeFillBuyOrder();
      });

      describe("fillSellOrder", function () {
        shouldBehaveLikeFillSellOrder();
      });

      describe("cancelBuyOrder", function () {
        shouldBehaveLikeCancelBuyOrder();
      });

      describe("cancelSellOrder", function () {
        shouldBehaveLikeCancelSellOrder();
      });

      describe("setOptionPremiumDiscount", function () {
        shouldBehaveLikeSetOptionPremiumDiscount();
      });

      describe("setITMOptionPriceRatio", function () {
        shouldBehaveLikeSetITMOptionPriceRatio();
      });

      describe("deposit", function () {
        shouldBehaveLikeDeposit();
      });
    });
  });
}