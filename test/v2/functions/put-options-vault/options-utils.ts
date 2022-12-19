import { BigNumberish } from "ethers";
import { Context } from "mocha";
import { MockOToken } from "../../../../typechain";
import { MockOToken__factory } from "./../../../../typechain/factories/MockOToken__factory";

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
