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
  shouldBehaveLikeSetOptionPremiumRatio,
  shouldBehaveLikeSetStrikeMultiplier,
  shouldBehaveLikeWithdraw,
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
  shouldBehaveLikeMaxOrderActiveGetter,
  shouldBehaveLikeMaxRedeemGetter,
  shouldBehaveLikeMaxWithdrawGetter,
  shouldBehaveLikeMinChunkValueGetter,
  shouldBehaveLikeOptionPremiumRatioGetter,
  shouldBehaveLikeOpynAddressBookGetter,
  shouldBehaveLikePositionsGetter,
  shouldBehaveLikePricerGetter,
  shouldBehaveLikeSellOrderGetter,
  shouldBehaveLikeStrikeMultiplierGetter,
  shouldBehaveLikeTotalAssetsGetter,
  shouldBehaveLikeUnderlyingOptionsAssetGetter,
} from "./view";

export function shouldBehaveLikePutOptionsVault(): void {
  describe("Put Options Vault", function () {
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

      describe("optionPremiumRatio", function () {
        shouldBehaveLikeOptionPremiumRatioGetter();
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

      describe("maxWithdraw", function () {
        shouldBehaveLikeMaxWithdrawGetter();
      });

      describe("maxRedeem", function () {
        shouldBehaveLikeMaxRedeemGetter();
      });

      describe("maxOrderActive", function () {
        shouldBehaveLikeMaxOrderActiveGetter();
      });

      describe("minChunkValue", function () {
        shouldBehaveLikeMinChunkValueGetter();
      });

      describe("opynAddressBook", function () {
        shouldBehaveLikeOpynAddressBookGetter();
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

      describe("setOptionPremiumRatio", function () {
        shouldBehaveLikeSetOptionPremiumRatio();
      });

      describe("setITMOptionPriceRatio", function () {
        shouldBehaveLikeSetITMOptionPriceRatio();
      });

      describe("deposit", function () {
        shouldBehaveLikeDeposit();
      });

      describe("withdraw", function () {
        shouldBehaveLikeWithdraw();
      });
    });
  });
}
