import { O_TOKEN_DECIMALS } from "./../constants";
import { MockOToken } from "./../../../../../typechain/MockOToken.d";
import { expect } from "chai";
import { getCurrentTime, toUnit } from "../../../utils";
import { EXPIRY_DELTA_MIN, USDC_DECIMALS } from "../constants";

export function shouldBehaveLikeWithdraw(): void {
  const ONE_HUNDRED_USDC = toUnit(100, USDC_DECIMALS);
  const DEPOSIT_AMOUNT = toUnit(500, USDC_DECIMALS);
  const SPOT_PRICE = toUnit(1_000, USDC_DECIMALS);
  const STRIKE_PRICE = toUnit(850, USDC_DECIMALS);
  const O_TOKEN_AMOUNT = toUnit(4, O_TOKEN_DECIMALS);
  let oToken: MockOToken;

  beforeEach(async function () {
    ({ oToken } = await this.createBuyOrder(
      STRIKE_PRICE,
      (await getCurrentTime()) + EXPIRY_DELTA_MIN + 360,
      DEPOSIT_AMOUNT,
      SPOT_PRICE,
    ));

    await this.usdc.transfer(this.putOptionsVault.address, ONE_HUNDRED_USDC);
  });

  describe("when buy order is active", function () {
    it("forbids to withdraw full balance", async function () {
      await expect(
        this.putOptionsVault.withdraw(
          await this.usdc.balanceOf(this.putOptionsVault.address),
          this.signers.admin.address,
          this.signers.admin.address,
        ),
      ).to.be.revertedWith("ERC4626: withdraw more than max");
    });

    it("withdraws only unlocked part", async function () {
      await expect(() =>
        this.putOptionsVault.withdraw(
          ONE_HUNDRED_USDC,
          this.signers.admin.address,
          this.signers.admin.address,
        ),
      ).to.changeTokenBalances(
        this.usdc,
        [this.signers.admin, this.putOptionsVault],
        [ONE_HUNDRED_USDC, -ONE_HUNDRED_USDC.toBigInt()],
      );
    });
  });

  describe("when buy order is filled", function () {
    beforeEach(async function () {
      await this.fillBuyOrder(oToken, O_TOKEN_AMOUNT);
    });

    it("allows to withdraw full balance", async function () {
      const balance = await this.usdc.balanceOf(this.putOptionsVault.address);

      await expect(() =>
        this.putOptionsVault.withdraw(
          balance,
          this.signers.admin.address,
          this.signers.admin.address,
        ),
      ).to.changeTokenBalances(
        this.usdc,
        [this.signers.admin, this.putOptionsVault],
        [balance, -balance.toBigInt()],
      );
    });
  });
}
