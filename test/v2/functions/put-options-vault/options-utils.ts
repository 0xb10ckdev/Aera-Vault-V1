import { BigNumberish } from "ethers";
import { Context } from "mocha";
import { MockOToken } from "../../../../typechain";
import { toUnit } from "../../utils";
import { MockOToken__factory } from "./../../../../typechain/factories/MockOToken__factory";
import {
  DEFAULT_PREMIUM,
  DEFAULT_SPOT_PRICE,
  O_TOKEN_DECIMALS,
  PRICER_DECIMALS,
  USDC_DECIMALS,
} from "./constants";

export async function createOToken(
  this: Context,
  strikePrice: BigNumberish,
  expiryTimestamp: BigNumberish,
): Promise<MockOToken> {
  return await new MockOToken__factory(this.signers.admin).deploy(
    this.mocks.oTokenController.address,
    this.weth.address,
    this.usdc.address,
    this.usdc.address,
    strikePrice,
    expiryTimestamp,
    true,
  );
}

export async function createAndFillBuyOrder(
  this: Context,
  strikePrice: BigNumberish,
  expiryTimestamp: number,
  usdcAmount: BigNumberish,
  spotPrice: BigNumberish = DEFAULT_SPOT_PRICE,
  oTokenAmount: BigNumberish = toUnit(10, O_TOKEN_DECIMALS),
  premium: BigNumberish = DEFAULT_PREMIUM,
): Promise<{ oToken: MockOToken }> {
  const { oToken } = await this.createBuyOrder(
    strikePrice,
    expiryTimestamp,
    usdcAmount,
    spotPrice,
  );

  await this.mocks.pricer.setPremium(premium);
  await oToken.approve(this.putOptionsVault.address, oTokenAmount);
  await this.putOptionsVault.fillBuyOrder(oToken.address, oTokenAmount);

  return { oToken };
}

export async function createBuyOrder(
  this: Context,
  strikePrice: BigNumberish,
  expiryTimestamp: number,
  usdcAmount: BigNumberish,
  spotPrice: BigNumberish = DEFAULT_SPOT_PRICE,
): Promise<{ oToken: MockOToken }> {
  const oToken = await this.createOToken(strikePrice, expiryTimestamp);
  await oToken.mintOtoken(
    this.signers.admin.address,
    toUnit(1000, O_TOKEN_DECIMALS),
  );
  await this.mocks.pricer.setSpot(spotPrice);

  await this.usdc.approve(this.putOptionsVault.address, usdcAmount);
  await this.putOptionsVault.deposit(usdcAmount, this.signers.admin.address);

  return {
    oToken,
  };
}
