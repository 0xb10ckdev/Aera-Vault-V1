import { BigNumberish } from "ethers";
import { MockOToken } from "../../../../typechain";

declare module "mocha" {
  interface Context {
    createOToken: (
      strikePrice: BigNumberish,
      expireTimestamp: number,
    ) => Promise<MockOToken>;
  }
}
