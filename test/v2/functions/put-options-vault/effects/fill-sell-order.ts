import { expect } from "chai";
import { BigNumber } from "ethers";
import { MockOToken } from "../../../../../typechain";
import { getCurrentTime, toUnit } from "../../../utils";
import {
  EXPIRY_DELTA_MIN,
  O_TOKEN_DECIMALS,
  USDC_DECIMALS,
} from "../constants";

export function shouldBehaveLikeFillSellOrder(): void {
  describe("when sell order is not active", function () {
    it("reverts", async function () {
      await expect(this.putOptionsVault.fillSellOrder(1)).to.be.revertedWith(
        `Aera__SellOrderIsNotActive()`,
      );
    });
  });

  describe("when called by stranger", function () {
    it("reverts", async function () {
      await expect(
        this.putOptionsVault.connect(this.signers.stranger).fillSellOrder(1),
      ).to.be.revertedWith(`Aera__CallerIsNotBroker()`);
    });
  });

  describe("when sell order is active", function () {
    let oToken: MockOToken;
    let oTokenAmount: BigNumber;
    beforeEach(async function () {
      oTokenAmount = toUnit(4, O_TOKEN_DECIMALS);

      ({ oToken } = await this.createAndFillBuyOrder(
        toUnit(850, USDC_DECIMALS),
        (await getCurrentTime()) + EXPIRY_DELTA_MIN + 360,
        toUnit(500, USDC_DECIMALS),
        toUnit(1000, USDC_DECIMALS),
        oTokenAmount,
      ));
    });

    describe("when selling full oToken vault balance", function () {
      beforeEach(async function () {
        await this.putOptionsVault.sell(oToken.address, oTokenAmount);
      });

      describe("when not enough USDC is offered", function () {
        const ONE_USDC = toUnit(1, USDC_DECIMALS);
        it("reverts", async function () {
          await expect(
            this.putOptionsVault.fillSellOrder(ONE_USDC),
          ).to.be.revertedWith(`Aera__NotEnoughAssets(${ONE_USDC})`);
        });
      });

      describe("when exact USDC is offered", function () {
        // (4 oTokens * 140 USDC) - 5% discount = 560 - 5% = 532 USDC
        const EXACT_USDC_PRICE = toUnit(532, USDC_DECIMALS);

        beforeEach(async function () {
          await this.usdc.approve(
            this.putOptionsVault.address,
            EXACT_USDC_PRICE,
          );
        });

        it("transfers USDC to vault", async function () {
          await expect(() =>
            this.putOptionsVault.fillSellOrder(EXACT_USDC_PRICE),
          ).to.changeTokenBalances(
            this.usdc,
            [this.signers.admin, this.putOptionsVault],
            [-EXACT_USDC_PRICE.toBigInt(), EXACT_USDC_PRICE],
          );
        });

        it("transfers oToken to user", async function () {
          await expect(() =>
            this.putOptionsVault.fillSellOrder(EXACT_USDC_PRICE),
          ).to.changeTokenBalances(
            oToken,
            [this.signers.admin, this.putOptionsVault],
            [oTokenAmount, -oTokenAmount.toBigInt()],
          );
        });

        it("emits", async function () {
          await expect(this.putOptionsVault.fillSellOrder(EXACT_USDC_PRICE))
            .to.emit(this.putOptionsVault, "SellOrderFilled")
            .withArgs(oToken.address, EXACT_USDC_PRICE);
        });

        describe("side effects", function () {
          beforeEach(async function () {
            await this.putOptionsVault.fillSellOrder(EXACT_USDC_PRICE);
          });

          it("deletes sellOrder", async function () {
            expect((await this.putOptionsVault.sellOrder()).active).to.be
              .false;
          });

          it("removes oToken from positions", async function () {
            expect(await this.putOptionsVault.positions()).to.be.lengthOf(0);
          });
        });
      });

      describe("when offered is greater than required", function () {
        const OFFERED = toUnit(550, USDC_DECIMALS);

        beforeEach(async function () {
          await this.usdc.approve(this.putOptionsVault.address, OFFERED);
        });

        it("works", async function () {
          await expect(() =>
            this.putOptionsVault.fillSellOrder(OFFERED),
          ).to.changeTokenBalances(
            this.usdc,
            [this.signers.admin, this.putOptionsVault],
            [-OFFERED.toBigInt(), OFFERED],
          );
        });
      });
    });

    describe("when selling partial oToken vault balance", function () {
      const EXACT_USDC_PRICE = toUnit(134, USDC_DECIMALS);

      beforeEach(async function () {
        await this.putOptionsVault.sell(
          oToken.address,
          toUnit(1, O_TOKEN_DECIMALS),
        );
        await this.usdc.approve(
          this.putOptionsVault.address,
          EXACT_USDC_PRICE,
        );
        await this.putOptionsVault.fillSellOrder(EXACT_USDC_PRICE);
      });

      it("does not remove oToken from positions", async function () {
        const positions = await this.putOptionsVault.positions();

        expect(positions).to.have.lengthOf(1);
        expect(positions[0]).to.eq(oToken.address);
      });
    });
  });
}
