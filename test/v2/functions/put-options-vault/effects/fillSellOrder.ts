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
        this.putOptionsVault.connect(this.signers.manager).fillSellOrder(1),
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

      describe("when enough USDC is offered", function () {
        const ONE_THOUSAND_USDC = toUnit(1000, USDC_DECIMALS);

        beforeEach(async function () {
          await this.usdc.approve(
            this.putOptionsVault.address,
            ONE_THOUSAND_USDC,
          );
        });

        it("transfers USDC to vault", async function () {
          await expect(() =>
            this.putOptionsVault.fillSellOrder(ONE_THOUSAND_USDC),
          ).to.changeTokenBalances(
            this.usdc,
            [this.signers.admin, this.putOptionsVault],
            [-ONE_THOUSAND_USDC.toBigInt(), ONE_THOUSAND_USDC],
          );
        });

        it("transfers oToken to user", async function () {
          await expect(() =>
            this.putOptionsVault.fillSellOrder(ONE_THOUSAND_USDC),
          ).to.changeTokenBalances(
            oToken,
            [this.signers.admin, this.putOptionsVault],
            [oTokenAmount, -oTokenAmount.toBigInt()],
          );
        });

        it("emits", async function () {
          await expect(this.putOptionsVault.fillSellOrder(ONE_THOUSAND_USDC))
            .to.emit(this.putOptionsVault, "SellOrderFilled")
            .withArgs(oToken.address, ONE_THOUSAND_USDC);
        });

        describe("side effects", function () {
          beforeEach(async function () {
            await this.putOptionsVault.fillSellOrder(ONE_THOUSAND_USDC);
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
    });

    describe("when selling partial oToken vault balance", function () {
      const ONE_THOUSAND_USDC = toUnit(1000, USDC_DECIMALS);

      beforeEach(async function () {
        await this.putOptionsVault.sell(
          oToken.address,
          toUnit(1, O_TOKEN_DECIMALS),
        );
        await this.usdc.approve(
          this.putOptionsVault.address,
          ONE_THOUSAND_USDC,
        );
        await this.putOptionsVault.fillSellOrder(ONE_THOUSAND_USDC);
      });

      it("does not remove oToken from positions", async function () {
        const positions = await this.putOptionsVault.positions();

        expect(positions).to.have.lengthOf(1);
        expect(positions[0]).to.eq(oToken.address);
      });
    });
  });
}
