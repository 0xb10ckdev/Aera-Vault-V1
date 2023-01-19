import { setNextBlockTimestamp, getCurrentTime } from "../../../utils";
import { expect } from "chai";
import { ONE } from "../../../constants";
import { toUnit } from "../../../utils";
import { MAX_ORDER_ACTIVE } from "../constants";

export function shouldBehaveLikeCancelBuyOrder(): void {
  const AMOUNT = toUnit(10, 6);
  describe("when buy order is not active", function () {
    it("reverts", async function () {
      await expect(this.putOptionsVault.cancelBuyOrder()).to.be.revertedWith(
        "AeraPOV__BuyOrderIsNotActive",
      );
    });
  });

  describe("when buy order is active", function () {
    beforeEach(async function () {
      await this.usdc.approve(this.putOptionsVault.address, AMOUNT);
      await this.mocks.pricer.setSpot(ONE);

      await this.putOptionsVault.deposit(AMOUNT, this.signers.admin.address);
    });

    it("works", async function () {
      await this.putOptionsVault.cancelBuyOrder();

      expect((await this.putOptionsVault.buyOrder()).active).is.false;
    });

    it("emits", async function () {
      const buyOrder = await this.putOptionsVault.buyOrder();

      await expect(this.putOptionsVault.cancelBuyOrder())
        .to.emit(this.putOptionsVault, "BuyOrderCancelled")
        .withArgs(
          buyOrder.minExpiryTimestamp,
          buyOrder.maxExpiryTimestamp,
          buyOrder.minStrikePrice,
          buyOrder.maxStrikePrice,
          buyOrder.underlyingAssetAmount,
        );
    });

    describe("when called by stranger", function () {
      describe("before MAX_ORDER_ACTIVE", function () {
        it("reverts", async function () {
          await expect(
            this.putOptionsVault
              .connect(this.signers.stranger)
              .cancelBuyOrder(),
          ).to.be.revertedWith("AeraPOV__CallerIsNotBroker");
        });
      });

      describe("after MAX_ORDER_ACTIVE", function () {
        beforeEach(async function () {
          await setNextBlockTimestamp(
            (await getCurrentTime()) + MAX_ORDER_ACTIVE + 1,
          );
        });

        it("works", async function () {
          await this.putOptionsVault
            .connect(this.signers.stranger)
            .cancelBuyOrder();

          expect((await this.putOptionsVault.buyOrder()).active).is.false;
        });
      });
    });
  });
}
