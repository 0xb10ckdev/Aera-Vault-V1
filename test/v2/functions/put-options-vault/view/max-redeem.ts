import { expect } from "chai";
import { MockOToken } from "../../../../../typechain";
import { convertToShares, getCurrentTime, toUnit } from "../../../utils";
import {
  EXPIRY_DELTA_MIN,
  O_TOKEN_DECIMALS,
  USDC_DECIMALS,
} from "../constants";

export function shouldBehaveLikeMaxRedeemGetter(): void {
  const ONE_HUNDRED_USDC = toUnit(100, USDC_DECIMALS);
  const DEPOSIT_AMOUNT = toUnit(500, USDC_DECIMALS);
  const SPOT_PRICE = toUnit(1_000, USDC_DECIMALS);
  const STRIKE_PRICE = toUnit(850, USDC_DECIMALS);
  const O_TOKEN_AMOUNT = toUnit(4, O_TOKEN_DECIMALS);
  const TOTAL_SHARES = DEPOSIT_AMOUNT; // since there is only one deposit shares = assets
  let oToken: MockOToken;

  describe("when buy order is active", function () {
    beforeEach(async function () {
      ({ oToken } = await this.createBuyOrder(
        STRIKE_PRICE,
        (await getCurrentTime()) + EXPIRY_DELTA_MIN + 360,
        DEPOSIT_AMOUNT,
        SPOT_PRICE,
      ));

      await this.usdc.transfer(this.putOptionsVault.address, ONE_HUNDRED_USDC);
    });

    describe("when called for stranger", function () {
      it("returns 0", async function () {
        expect(
          await this.putOptionsVault.maxRedeem(this.signers.stranger.address),
        ).to.eq(0);
      });
    });

    describe("when called for owner", function () {
      it("returns unlocked shares", async function () {
        expect(
          await this.putOptionsVault.maxRedeem(this.signers.admin.address),
        ).to.eq(
          TOTAL_SHARES.sub(
            convertToShares(
              TOTAL_SHARES,
              TOTAL_SHARES,
              DEPOSIT_AMOUNT.add(ONE_HUNDRED_USDC),
            ),
          ),
        );
      });
    });

    describe("when buy order is filled", function () {
      beforeEach(async function () {
        await this.fillBuyOrder(oToken, O_TOKEN_AMOUNT);
      });

      describe("when called for stranger", function () {
        it("returns 0", async function () {
          expect(
            await this.putOptionsVault.maxRedeem(
              this.signers.stranger.address,
            ),
          ).to.eq(0);
        });
      });

      describe("when called for owner", function () {
        it("returns all shares", async function () {
          expect(
            await this.putOptionsVault.maxRedeem(this.signers.admin.address),
          ).to.eq(TOTAL_SHARES);
        });
      });
    });
  });
}
