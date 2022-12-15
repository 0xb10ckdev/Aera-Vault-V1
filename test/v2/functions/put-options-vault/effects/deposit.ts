import { expect } from "chai";
import { ONE } from "../../../constants";
import { toUnit } from "../../../utils";
import { getCurrentTime, setNextBlockTimestamp } from "./../../../utils";
import {
  EXPIRY_DELTA_MAX,
  EXPIRY_DELTA_MIN,
  STRIKE_MULTIPLIER_MAX,
  STRIKE_MULTIPLIER_MIN,
} from "./../constants";

export function shouldBehaveLikeDeposit(): void {
  const AMOUNT = toUnit(1_000, 6);
  describe("access", function () {
    describe("when owner deposits", function () {
      beforeEach(async function () {
        await this.usdc.approve(this.putOptionsVault.address, AMOUNT);
      });

      it("works", async function () {
        await expect(
          this.putOptionsVault.deposit(AMOUNT, this.signers.admin.address),
        ).not.to.throw;
      });
    });

    describe("when stranger deposits", function () {
      it("reverts", async function () {
        await expect(
          this.putOptionsVault
            .connect(this.signers.manager)
            .deposit(AMOUNT, this.signers.admin.address),
        ).to.revertedWith("ERC4626: deposit more than max");
      });
    });
  });

  describe("when deposit", function () {
    let now: number;
    const PRICE = ONE;
    beforeEach(async function () {
      await this.usdc.approve(this.putOptionsVault.address, AMOUNT);
      await this.mocks.pricer.setSpot(PRICE);

      const currentTime = await getCurrentTime();
      now = currentTime + 10;

      await setNextBlockTimestamp(now);
    });

    describe("when deposit is less than MIN_CHUNK_VALUE", function () {
      it("does not create buy order", async function () {
        await this.putOptionsVault.deposit(1, this.signers.admin.address);

        expect((await this.putOptionsVault.buyOrder()).active).is.false;
      });
    });

    it("creates buy order", async function () {
      await this.putOptionsVault.deposit(AMOUNT, this.signers.admin.address);

      const buyOrder = await this.putOptionsVault.buyOrder();

      expect(buyOrder.active).to.be.true;
      expect(buyOrder.amount).to.eq(AMOUNT);
      expect(buyOrder.created).to.eq(now);
      expect(buyOrder.minExpiryTimestamp).is.eq(now + EXPIRY_DELTA_MIN);
      expect(buyOrder.maxExpiryTimestamp).is.eq(now + EXPIRY_DELTA_MAX);
      expect(buyOrder.minStrikePrice).is.eq(
        PRICE.mul(STRIKE_MULTIPLIER_MIN * 100).div(100),
      );
      expect(buyOrder.maxStrikePrice).is.eq(
        PRICE.mul(STRIKE_MULTIPLIER_MAX * 100).div(100),
      );
    });

    it("emits", async function () {
      await expect(
        this.putOptionsVault.deposit(AMOUNT, this.signers.admin.address),
      )
        .to.emit(this.putOptionsVault, "BuyOrderCreated")
        .withArgs(
          now + EXPIRY_DELTA_MIN,
          now + EXPIRY_DELTA_MAX,
          PRICE.mul(STRIKE_MULTIPLIER_MIN * 100).div(100),
          PRICE.mul(STRIKE_MULTIPLIER_MAX * 100).div(100),
          AMOUNT,
        );
    });
  });
}
