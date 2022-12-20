import { BigNumberish } from "ethers";
import { Context } from "mocha";
import { MockOToken } from "../../../../typechain";
import { toUnit } from "../../utils";
import { MockOToken__factory } from "./../../../../typechain/factories/MockOToken__factory";
import { O_TOKEN_DECIMALS, PRICER_DECIMALS, USDC_DECIMALS } from "./constants";

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
  spotPrice: BigNumberish = toUnit(1000, USDC_DECIMALS),
  oTokenAmount: BigNumberish = toUnit(10, O_TOKEN_DECIMALS),
): Promise<{ oToken: MockOToken }> {
  const oToken = await this.createOToken(strikePrice, expiryTimestamp);
  await oToken.mintOtoken(
    this.signers.admin.address,
    toUnit(1000, O_TOKEN_DECIMALS),
  );
  await this.mocks.pricer.setSpot(spotPrice);

  await this.usdc.approve(this.putOptionsVault.address, usdcAmount);
  await this.putOptionsVault.deposit(usdcAmount, this.signers.admin.address);

  await this.mocks.pricer.setPremium(toUnit(140, PRICER_DECIMALS));

  await oToken.approve(this.putOptionsVault.address, oTokenAmount);

  await this.putOptionsVault.fillBuyOrder(oToken.address, oTokenAmount);

  return { oToken };
}
