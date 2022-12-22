import { BigNumberish } from "ethers";
import { MockOToken } from "../../../../typechain";

declare module "mocha" {
  interface Context {
    createOToken: (
      strikePrice: BigNumberish,
      expireTimestamp: number,
    ) => Promise<MockOToken>;

    createAndFillBuyOrder: (
      strikePrice: BigNumberish,
      expiryTimestamp: number,
      usdcAmount: BigNumberish,
      spotPrice?: BigNumberish,
      oTokenAmount?: BigNumberish,
      premium?: BigNumberish,
    ) => Promise<{ oToken: MockOToken }>;

    createBuyOrder(
      this: Context,
      strikePrice: BigNumberish,
      expiryTimestamp: number,
      usdcAmount: BigNumberish,
      spotPrice?: BigNumberish,
    ): Promise<{ oToken: MockOToken }>;
  }
}
