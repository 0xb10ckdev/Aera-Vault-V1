import { expect } from "chai";
import { BigNumber } from "ethers";
import { Context } from "mocha";
import {
  IOToken,
  IOTokenController__factory,
  OracleInterface__factory,
} from "../../../../typechain";
import { IOToken__factory } from "../../../../typechain/factories/IOToken__factory";
import { Ownable__factory } from "../../../../typechain/factories/Ownable__factory";
import {
  EXPIRY_DELTA_MIN,
  O_TOKEN_DECIMALS,
  USDC_DECIMALS,
} from "../../functions/put-options-vault/constants";
import {
  impersonate,
  mineBlock,
  setNextBlockTimestamp,
  toUnit,
  toWei,
} from "../../utils";

export function shouldBehaveLikePutOptionsCreateFillRedeemBuyOrder(): void {
  const ONE_THOUSAND_USDC = toUnit(1_000, USDC_DECIMALS);

  describe("create-fill-redeem buy order", function () {
    let oToken: IOToken;
    const ETH_USDC_PRICE = 3147;
    const PREMIUM = toUnit(140, 8);
    let strikePrice: BigNumber;

    beforeEach(async function () {
      await this.mocks.pricer.setSpot(toUnit(ETH_USDC_PRICE, 8));
      await this.mocks.pricer.setPremium(PREMIUM);
      await this.putOptionsVault.setExpiryDelta(EXPIRY_DELTA_MIN, 86400 * 15);

      await this.usdc.approve(this.putOptionsVault.address, ONE_THOUSAND_USDC);
      await this.putOptionsVault.deposit(
        ONE_THOUSAND_USDC,
        this.signers.admin.address,
      );

      oToken = IOToken__factory.connect(
        "0x7B3Db87712a12e197ff8568B9DF59CcEd46674A6",
        this.signers.admin,
      );

      strikePrice = await oToken.strikePrice();

      await oToken
        .connect(
          await impersonate("0x3396c5ade0266f1bd93911f9acb9413333a735da"),
        )
        .transfer(this.signers.admin.address, toUnit(1000, O_TOKEN_DECIMALS));
    });

    async function setExpiryPrice(
      this: Context,
      price: BigNumber,
    ): Promise<
      Promise<Promise<Promise<Promise<Promise<Promise<Promise<void>>>>>>>
    > {
      const controller = IOTokenController__factory.connect(
        await oToken.controller(),
        this.signers.admin,
      );

      const oracle = OracleInterface__factory.connect(
        await controller.oracle(),
        this.signers.admin,
      );

      const oracleOwnable = Ownable__factory.connect(
        oracle.address,
        this.signers.admin,
      );

      const oracleOwner = await oracleOwnable.owner();
      await this.signers.admin.sendTransaction({
        to: oracleOwner,
        value: toWei(1),
      });
      await oracle
        .connect(await impersonate(oracleOwner))
        .setAssetPricer(this.weth.address, this.signers.admin.address);

      await oracle.setExpiryPrice(
        this.weth.address,
        await oToken.expiryTimestamp(),
        price,
      );
    }

    describe("scenario", function () {
      const EXPIRY_PRICE_DELTA = toUnit(100, 8);
      const O_TOKEN_AMOUNT = toUnit(10, O_TOKEN_DECIMALS);

      beforeEach(async function () {
        await oToken.approve(this.putOptionsVault.address, O_TOKEN_AMOUNT);
        await this.putOptionsVault.fillBuyOrder(
          oToken.address,
          O_TOKEN_AMOUNT,
        );

        expect((await this.putOptionsVault.buyOrder()).active).to.be.false;

        await setNextBlockTimestamp(
          (await oToken.expiryTimestamp()).toNumber(),
        );
        await mineBlock();

        await setExpiryPrice.call(this, strikePrice.sub(EXPIRY_PRICE_DELTA));

        await setNextBlockTimestamp(
          (await oToken.expiryTimestamp()).toNumber() + 86400 * 3,
        );
        await mineBlock();
      });

      it("works", async function () {
        await expect(() =>
          this.putOptionsVault.checkExpired({
            gasLimit: 5000000,
          }),
        ).to.changeTokenBalance(
          this.usdc,
          this.putOptionsVault,
          toUnit(10 * 100, USDC_DECIMALS), // 10 oTokens each 100 USDC ITM strike price
        );

        expect(await this.putOptionsVault.positions()).to.be.lengthOf(0);
      });

      it("emits", async function () {
        await expect(
          this.putOptionsVault.checkExpired({
            gasLimit: 5000000,
          }),
        )
          .to.emit(this.putOptionsVault, "OptionRedeemed")
          .withArgs(oToken.address);
      });
    });
  });
}
