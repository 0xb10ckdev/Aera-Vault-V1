import { expect } from "chai";
import { BigNumber } from "ethers";
import { MockOToken } from "../../../../../typechain";
import { getCurrentTime, toUnit } from "../../../utils";
import {
  EXPIRY_DELTA_MIN,
  O_TOKEN_DECIMALS,
  PRICER_DECIMALS,
  USDC_DECIMALS,
} from "../constants";

export function shouldBehaveLikeFillBuyOrder(): void {
  const O_TOKEN_AMOUNT = toUnit(1, O_TOKEN_DECIMALS);
  const USDC_AMOUNT = toUnit(560, USDC_DECIMALS);
  const SPOT_PRICE = toUnit(1_000, USDC_DECIMALS);
  const STRIKE_PRICE = toUnit(850, USDC_DECIMALS);

  let oToken: MockOToken;

  beforeEach(async function () {
    oToken = await this.createOToken(
      STRIKE_PRICE,
      (await getCurrentTime()) + EXPIRY_DELTA_MIN + 360,
    );

    await oToken.mintOtoken(
      this.signers.admin.address,
      toUnit(1000, O_TOKEN_DECIMALS),
    );
  });

  describe("when buy order is not active", function () {
    it("reverts", async function () {
      await expect(
        this.putOptionsVault.fillBuyOrder(oToken.address, O_TOKEN_AMOUNT),
      ).to.be.revertedWith("Aera__BuyOrderIsNotActive");
    });
  });

  describe("when buy order is active", function () {
    beforeEach(async function () {
      await this.mocks.pricer.setSpot(SPOT_PRICE);

      await this.usdc.approve(this.putOptionsVault.address, USDC_AMOUNT);
      await this.putOptionsVault.deposit(
        USDC_AMOUNT,
        this.signers.admin.address,
      );
    });

    describe("when called by stranger", function () {
      it("reverts", async function () {
        await expect(
          this.putOptionsVault
            .connect(this.signers.manager)
            .fillBuyOrder(oToken.address, O_TOKEN_AMOUNT),
        ).to.be.revertedWith("Aera__CallerIsNotBroker");
      });
    });

    describe("when oToken parameters are invalid", function () {
      describe("when not put option", function () {
        it("reverts", async function () {
          await oToken.setIsPut(false);

          await expect(
            this.putOptionsVault.fillBuyOrder(oToken.address, O_TOKEN_AMOUNT),
          ).to.be.revertedWith("Aera__ExpectedPutOption");
        });
      });

      describe("when invalid underlying asset", function () {
        it("reverts", async function () {
          await oToken.setUnderlyingAsset(this.usdc.address);

          await expect(
            this.putOptionsVault.fillBuyOrder(oToken.address, O_TOKEN_AMOUNT),
          ).to.be.revertedWith(
            `Aera__InvalidUnderlyingAsset("${this.weth.address}", "${this.usdc.address}")`,
          );
        });
      });

      describe("when invalid collateral asset", function () {
        it("reverts", async function () {
          await oToken.setCollateralAsset(this.weth.address);

          await expect(
            this.putOptionsVault.fillBuyOrder(oToken.address, O_TOKEN_AMOUNT),
          ).to.be.revertedWith(
            `Aera__InvalidCollateralAsset("${this.usdc.address}", "${this.weth.address}")`,
          );
        });
      });

      describe("when invalid strike asset", function () {
        it("reverts", async function () {
          await oToken.setStrikeAsset(this.weth.address);

          await expect(
            this.putOptionsVault.fillBuyOrder(oToken.address, O_TOKEN_AMOUNT),
          ).to.be.revertedWith(
            `Aera__InvalidStrikeAsset("${this.usdc.address}", "${this.weth.address}")`,
          );
        });
      });

      describe("when invalid expiry timestamp", function () {
        describe("when expiry timestamp is before min timestamp", function () {
          let minExpiryTimestamp: BigNumber;
          let maxExpiryTimestamp: BigNumber;
          beforeEach(async function () {
            ({ minExpiryTimestamp, maxExpiryTimestamp } =
              await this.putOptionsVault.buyOrder());
            await oToken.setExpiryTimestamp(minExpiryTimestamp.sub(1));
          });

          it("reverts", async function () {
            await expect(
              this.putOptionsVault.fillBuyOrder(
                oToken.address,
                O_TOKEN_AMOUNT,
              ),
            ).to.be.revertedWith(
              `Aera__ExpiryTimestampIsNotInRange(${minExpiryTimestamp}, ${maxExpiryTimestamp}, ${minExpiryTimestamp.sub(
                1,
              )})`,
            );
          });
        });

        describe("when expiry timestamp is after max timestamp", function () {
          let minExpiryTimestamp: BigNumber;
          let maxExpiryTimestamp: BigNumber;
          beforeEach(async function () {
            ({ minExpiryTimestamp, maxExpiryTimestamp } =
              await this.putOptionsVault.buyOrder());
            await oToken.setExpiryTimestamp(maxExpiryTimestamp.add(1));
          });

          it("reverts", async function () {
            await expect(
              this.putOptionsVault.fillBuyOrder(
                oToken.address,
                O_TOKEN_AMOUNT,
              ),
            ).to.be.revertedWith(
              `Aera__ExpiryTimestampIsNotInRange(${minExpiryTimestamp}, ${maxExpiryTimestamp}, ${maxExpiryTimestamp.add(
                1,
              )})`,
            );
          });
        });
      });

      describe("when invalid strike price", function () {
        describe("when strike price is below min price", function () {
          let minStrikePrice: BigNumber;
          let maxStrikePrice: BigNumber;
          beforeEach(async function () {
            ({ minStrikePrice, maxStrikePrice } =
              await this.putOptionsVault.buyOrder());

            await oToken.setStrikePrice(minStrikePrice.sub(1));
          });

          it("reverts", async function () {
            await expect(
              this.putOptionsVault.fillBuyOrder(
                oToken.address,
                O_TOKEN_AMOUNT,
              ),
            ).to.be.revertedWith(
              `Aera__StrikePriceIsNotInRange(${minStrikePrice}, ${maxStrikePrice}, ${minStrikePrice.sub(
                1,
              )})`,
            );
          });
        });

        describe("when strike price is above max price", function () {
          let minStrikePrice: BigNumber;
          let maxStrikePrice: BigNumber;
          beforeEach(async function () {
            ({ minStrikePrice, maxStrikePrice } =
              await this.putOptionsVault.buyOrder());

            await oToken.setStrikePrice(maxStrikePrice.add(1));
          });

          it("reverts", async function () {
            await expect(
              this.putOptionsVault.fillBuyOrder(
                oToken.address,
                O_TOKEN_AMOUNT,
              ),
            ).to.be.revertedWith(
              `Aera__StrikePriceIsNotInRange(${minStrikePrice}, ${maxStrikePrice}, ${maxStrikePrice.add(
                1,
              )})`,
            );
          });
        });
      });
    });

    describe("when not enough oTokens are offered", function () {
      const OFFERED_O_TOKENS = toUnit(1, O_TOKEN_DECIMALS);
      beforeEach(async function () {
        await this.mocks.pricer.setPremium(toUnit(140, PRICER_DECIMALS));

        await oToken.approve(this.putOptionsVault.address, OFFERED_O_TOKENS);
      });

      it("reverts", async function () {
        // 140 + 5% = 147 (premium with discount)
        // 560 USDC / 147 ~= 3.80952380 oTokens
        await expect(
          this.putOptionsVault.fillBuyOrder(oToken.address, OFFERED_O_TOKENS),
        ).to.be.revertedWith(
          `Aera__NotEnoughOTokens(380952380, ${OFFERED_O_TOKENS})`,
        );
      });
    });

    describe("when enough oTokens are offered", function () {
      const OFFERED_O_TOKENS = toUnit(4, O_TOKEN_DECIMALS);
      beforeEach(async function () {
        await this.mocks.pricer.setPremium(toUnit(140, PRICER_DECIMALS));

        await oToken.approve(this.putOptionsVault.address, OFFERED_O_TOKENS);
      });

      it("user oTokens are transferred to vault", async function () {
        await expect(() =>
          this.putOptionsVault.fillBuyOrder(oToken.address, OFFERED_O_TOKENS),
        ).to.changeTokenBalances(
          oToken,
          [this.signers.admin, this.putOptionsVault],
          [-OFFERED_O_TOKENS.toBigInt(), OFFERED_O_TOKENS],
        );
      });

      it("vault transfers USDC to user", async function () {
        await expect(() =>
          this.putOptionsVault.fillBuyOrder(oToken.address, OFFERED_O_TOKENS),
        ).changeTokenBalances(
          this.usdc,
          [this.signers.admin, this.putOptionsVault],
          [USDC_AMOUNT, -USDC_AMOUNT.toBigInt()],
        );
      });

      it("emits", async function () {
        await expect(
          this.putOptionsVault.fillBuyOrder(oToken.address, OFFERED_O_TOKENS),
        )
          .to.emit(this.putOptionsVault, "BuyOrderFilled")
          .withArgs(oToken.address, OFFERED_O_TOKENS);
      });

      describe("side effects", function () {
        beforeEach(async function () {
          await this.putOptionsVault.fillBuyOrder(
            oToken.address,
            OFFERED_O_TOKENS,
          );
        });

        it("deletes buyOrder", async function () {
          expect((await this.putOptionsVault.buyOrder()).active).to.be.false;
        });

        it("adds oToken to positions", async function () {
          const positions = await this.putOptionsVault.positions();

          expect(positions).to.be.lengthOf(1);
          expect(positions[0]).to.eq(oToken.address);
        });
      });
    });
  });
}
