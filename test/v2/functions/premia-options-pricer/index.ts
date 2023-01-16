import { shouldBehaveLikePremiaOptionsPricerDeployment } from "./deployment";
import {
  shouldBehaveLikePremiaOptionsPricerPremiumGetter,
  shouldBehaveLikePremiaOptionsPricerSpotGetter,
} from "./view";

export function shouldBehaveLikePremiaOptionsPricer(): void {
  describe("Deployment", function () {
    shouldBehaveLikePremiaOptionsPricerDeployment();
  });

  describe("View", function () {
    describe("getPremium", function () {
      shouldBehaveLikePremiaOptionsPricerPremiumGetter();
    });

    describe("getSpot", function () {
      shouldBehaveLikePremiaOptionsPricerSpotGetter();
    });
  });
}
