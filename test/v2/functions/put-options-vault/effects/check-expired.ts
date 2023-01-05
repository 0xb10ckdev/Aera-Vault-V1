import { BigNumber } from "ethers";
import { expect } from "chai";
import { MockOToken } from "../../../../../typechain";
import { getCurrentTime, toUnit } from "../../../utils";
import { EXPIRY_DELTA_MIN, USDC_DECIMALS } from "../constants";

export function shouldBehaveLikeCheckExpired(): void {
  describe("when called on empty positions", function () {
    it("works", async function () {
      await expect(this.putOptionsVault.checkExpired()).not.to.be.reverted;
    });
  });

  describe("when positions exists", function () {
    let oToken: MockOToken;
    beforeEach(async function () {
      ({ oToken } = await this.createAndFillBuyOrder(
        toUnit(850, USDC_DECIMALS),
        (await getCurrentTime()) + EXPIRY_DELTA_MIN + 360,
        toUnit(500, USDC_DECIMALS),
        toUnit(1000, USDC_DECIMALS),
      ));
    });

    describe("when option is not expired", function () {
      beforeEach(async function () {
        await this.mocks.oTokenController.setRevertOnOperate(true);
      });

      it("does nothing", async function () {
        await this.putOptionsVault.checkExpired();

        expect(await this.putOptionsVault.positions()).to.lengthOf(1);
      });
    });

    describe("when option is expired", function () {
      it("removes option", async function () {
        await this.putOptionsVault.checkExpired();

        expect(await this.putOptionsVault.positions()).to.lengthOf(0);
      });

      it("emits", async function () {
        await expect(this.putOptionsVault.checkExpired())
          .to.emit(this.putOptionsVault, "OptionRedeemed")
          .withArgs(oToken.address);
      });
    });

    describe("when sell order is active", function () {
      let oTokenAmount: BigNumber;
      beforeEach(async function () {
        oTokenAmount = await oToken.balanceOf(this.putOptionsVault.address);

        await this.putOptionsVault.sell(oToken.address, oTokenAmount);
      });

      it("cancels sell order", async function () {
        await this.putOptionsVault.checkExpired();

        expect((await this.putOptionsVault.sellOrder()).active).is.false;
      });

      it("emits", async function () {
        await expect(this.putOptionsVault.checkExpired())
          .to.emit(this.putOptionsVault, "SellOrderCancelled")
          .withArgs(oToken.address, oTokenAmount);
      });
    });
  });
}
