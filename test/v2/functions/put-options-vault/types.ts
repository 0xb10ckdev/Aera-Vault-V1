import { BigNumber, BigNumberish } from "ethers";
import { MockOToken } from "../../../../typechain";

declare module "mocha" {
  interface Context {
    createOToken: (
      strikePrice: BigNumberish,
      expireTimestamp: number,
      whitelist?: boolean,
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

    fillBuyOrder(
      this: Context,
      oToken: MockOToken,
      oTokenAmount?: BigNumberish,
      premium?: BigNumberish,
    ): Promise<{ oToken: MockOToken }>;
  }
}

export type BuyOrder = {
  amount: BigNumber;
  minStrikePrice: BigNumber;
  maxStrikePrice: BigNumber;
  minExpiryTimestamp: BigNumber;
  maxExpiryTimestamp: BigNumber;
  created: BigNumber;
  active: boolean;
};
