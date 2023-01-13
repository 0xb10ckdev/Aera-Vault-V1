import { shouldBehaveLikePremiaOptionsPricerDeployment } from "./deployment";

export function shouldBehaveLikePremiaOptionsPricer(): void {
  describe("Deployment", function () {
    shouldBehaveLikePremiaOptionsPricerDeployment();
  });

  describe("View", function () {});
}
