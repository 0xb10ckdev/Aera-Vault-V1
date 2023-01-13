import { expect } from "chai";
import { ONE } from "../../../constants";
import { getCurrentTime, setNextBlockTimestamp, toUnit } from "../../../utils";
import {
  DEFAULT_MIN_CHUNK_VALUE,
  EXPIRY_DELTA_MAX,
  EXPIRY_DELTA_MIN,
  STRIKE_MULTIPLIER_MAX,
  STRIKE_MULTIPLIER_MIN,
  USDC_DECIMALS,
} from "../constants";
import { BuyOrder } from "../types";

export function shouldBehaveLikeDeposit(): void {
  const ONE_THOUSAND_USDC = toUnit(1_000, USDC_DECIMALS);

  describe("when owner deposits", function () {
    beforeEach(async function () {
      await this.usdc.approve(this.putOptionsVault.address, ONE_THOUSAND_USDC);
    });

    describe("when owner is receiver", function () {
      it("works", async function () {
        await expect(
          this.putOptionsVault.deposit(
            ONE_THOUSAND_USDC,
            this.signers.admin.address,
          ),
        ).not.to.be.reverted;
      });
    });

    describe("when stranger is receiver", function () {
      it("reverts", async function () {
        await expect(
          this.putOptionsVault.deposit(
            ONE_THOUSAND_USDC,
            this.signers.stranger.address,
          ),
        ).to.be.revertedWith("ERC4626: deposit more than max");
      });
    });
  });

  describe("when stranger deposits", function () {
    beforeEach(async function () {
      await this.usdc.transfer(
        this.signers.stranger.address,
        ONE_THOUSAND_USDC,
      );
      await this.usdc
        .connect(this.signers.stranger)
        .approve(this.putOptionsVault.address, ONE_THOUSAND_USDC);
    });

    describe("when stranger is the receiver", function () {
      it("reverts", async function () {
        await expect(
          this.putOptionsVault
            .connect(this.signers.stranger)
            .deposit(ONE_THOUSAND_USDC, this.signers.stranger.address),
        ).to.be.revertedWith("ERC4626: deposit more than max");
      });
    });

    describe("when owner is the receiver", function () {
      it("reverts", async function () {
        await expect(
          this.putOptionsVault
            .connect(this.signers.stranger)
            .deposit(ONE_THOUSAND_USDC, this.signers.admin.address),
        ).to.be.revertedWith("ERC4626: deposit more than max");
      });
    });
  });

  describe("when owner deposits", function () {
    let now: number;
    const PRICE = ONE;
    beforeEach(async function () {
      await this.usdc.approve(this.putOptionsVault.address, ONE_THOUSAND_USDC);
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
      await this.putOptionsVault.deposit(
        ONE_THOUSAND_USDC,
        this.signers.admin.address,
      );

      const buyOrder = await this.putOptionsVault.buyOrder();

      expect(buyOrder.active).to.be.true;
      expect(buyOrder.underlyingAssetAmount).to.eq(ONE_THOUSAND_USDC);
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
        this.putOptionsVault.deposit(
          ONE_THOUSAND_USDC,
          this.signers.admin.address,
        ),
      )
        .to.emit(this.putOptionsVault, "BuyOrderCreated")
        .withArgs(
          now + EXPIRY_DELTA_MIN,
          now + EXPIRY_DELTA_MAX,
          PRICE.mul(STRIKE_MULTIPLIER_MIN * 100).div(100),
          PRICE.mul(STRIKE_MULTIPLIER_MAX * 100).div(100),
          ONE_THOUSAND_USDC,
        );
    });

    describe("when buy order is active", function () {
      let buyOrder: BuyOrder;

      beforeEach(async function () {
        await this.usdc.approve(
          this.putOptionsVault.address,
          ONE_THOUSAND_USDC.add(DEFAULT_MIN_CHUNK_VALUE),
        );
        await this.putOptionsVault.deposit(
          DEFAULT_MIN_CHUNK_VALUE,
          this.signers.admin.address,
        );
        buyOrder = await this.putOptionsVault.buyOrder();
      });

      it("emits", async function () {
        await expect(
          this.putOptionsVault.deposit(
            ONE_THOUSAND_USDC,
            this.signers.admin.address,
          ),
        )
          .to.emit(this.putOptionsVault, "BuyOrderCancelled")
          .withArgs(
            buyOrder.minExpiryTimestamp,
            buyOrder.maxExpiryTimestamp,
            buyOrder.minStrikePrice,
            buyOrder.maxStrikePrice,
            buyOrder.underlyingAssetAmount,
          );
      });
    });
  });
}
