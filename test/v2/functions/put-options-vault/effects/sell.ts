import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { getCurrentTime, toUnit } from "../../../utils";
import {
  EXPIRY_DELTA_MIN,
  O_TOKEN_DECIMALS,
  USDC_DECIMALS,
} from "../constants";
import { MockOToken } from "./../../../../../typechain";

export function shouldBehaveLikeSell(): void {
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
  });

  describe("access", function () {
    describe("when called by stranger", function () {
      it("reverts", async function () {
        await expect(
          this.putOptionsVault
            .connect(this.signers.stranger)
            .sell(oToken.address, 1),
        ).to.be.revertedWith("Aera__CallerIsNotLiquidator");
      });
    });
  });

  describe("when oToken is not in positions list", function () {
    it("reverts", async function () {
      await expect(
        this.putOptionsVault.sell(this.usdc.address, 1),
      ).to.be.revertedWith(`Aera__UnknownOToken("${this.usdc.address}")`);
    });
  });

  describe("when amount is greater than balance", function () {
    it("reverts", async function () {
      const amount = toUnit(999999, O_TOKEN_DECIMALS);

      await expect(
        this.putOptionsVault.sell(oToken.address, amount),
      ).to.be.revertedWith(
        `Aera__InsufficientBalanceToSell(${amount}, ${oTokenAmount})`,
      );
    });
  });

  describe("when amount is valid", function () {
    it("works", async function () {
      const tx = await this.putOptionsVault.sell(oToken.address, oTokenAmount);

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const block = await ethers.provider.getBlock(tx.blockHash!);
      const order = await this.putOptionsVault.sellOrder();
      expect(order.active).is.true;
      expect(order.oToken).is.eq(oToken.address);
      expect(order.amount).is.eq(oTokenAmount);
      expect(order.created).is.eq(BigNumber.from(block.timestamp));
    });

    it("emits", async function () {
      await expect(
        await this.putOptionsVault.sell(oToken.address, oTokenAmount),
      )
        .to.emit(this.putOptionsVault, "SellOrderCreated")
        .withArgs(oToken.address, oTokenAmount);
    });
  });
}
