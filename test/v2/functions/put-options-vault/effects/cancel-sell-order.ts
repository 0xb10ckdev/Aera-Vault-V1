import { expect } from "chai";
import { BigNumber } from "ethers";
import { MockOToken } from "../../../../../typechain";
import { getCurrentTime, setNextBlockTimestamp, toUnit } from "../../../utils";
import {
  EXPIRY_DELTA_MIN,
  MAX_ORDER_ACTIVE,
  O_TOKEN_DECIMALS,
  USDC_DECIMALS,
} from "../constants";

export function shouldBehaveLikeCancelSellOrder(): void {
  describe("when sell order is not active", function () {
    it("reverts", async function () {
      await expect(this.putOptionsVault.cancelSellOrder()).to.be.revertedWith(
        "AeraPOV__SellOrderIsNotActive",
      );
    });
  });

  describe("when sell order is active", function () {
    let oToken: MockOToken;
    let oTokenAmount: BigNumber;
    beforeEach(async function () {
      oTokenAmount = toUnit(10, O_TOKEN_DECIMALS);

      ({ oToken } = await this.createAndFillBuyOrder(
        toUnit(850, USDC_DECIMALS),
        (await getCurrentTime()) + EXPIRY_DELTA_MIN + 360,
        toUnit(500, USDC_DECIMALS),
        toUnit(1000, USDC_DECIMALS),
        oTokenAmount,
      ));

      await this.putOptionsVault.sell(oToken.address, oTokenAmount);
    });

    it("works", async function () {
      await this.putOptionsVault.cancelSellOrder();

      expect((await this.putOptionsVault.sellOrder()).active).is.false;
    });

    it("emits", async function () {
      await expect(this.putOptionsVault.cancelSellOrder())
        .to.emit(this.putOptionsVault, "SellOrderCancelled")
        .withArgs(oToken.address, oTokenAmount);
    });

    describe("when called by stranger", function () {
      describe("before MAX_ORDER_ACTIVE", function () {
        it("reverts", async function () {
          await expect(
            this.putOptionsVault
              .connect(this.signers.stranger)
              .cancelSellOrder(),
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
            .cancelSellOrder();

          expect((await this.putOptionsVault.sellOrder()).active).is.false;
        });
      });
    });
  });
}
