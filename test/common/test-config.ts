import { chainIds } from "../../hardhat.config";
import { getConfig, getGasPrice, getBVault, getMerkleOrchard } from "../../scripts/config";
import { expect } from "chai";
import { BigNumber } from "ethers";
describe("getBVault", () => {
  it("gets default bvault when undefined", async () => {
    const badChain = 100000;
    const bvault = getBVault(badChain);
    expect(bvault).to.equal("0xBA12222222228d8Ba445958a75a0704d566BF2C8");
  });
  it("gets default correct bvault for a defined chain", async () => {
    const bvault = getBVault(chainIds.polygon);
    expect(bvault).to.equal("0xBA12222222228d8Ba445958a75a0704d566BF2C8");
  });
});

describe("getMerkleOrchard", () => {
  it("returns undefined", async () => {
    const badChain = 100000;
    const orchard = getMerkleOrchard(badChain);
    expect(orchard).to.equal(undefined);
  });
  it("gets default correct orchard for a defined chain", async () => {
    const orchard = getMerkleOrchard(chainIds.mainnet);
    expect(orchard).to.equal("0xdAE7e32ADc5d490a43cCba1f0c736033F2b4eFca");
  });
});

describe("getGasPrice", () => {
  describe("when gasPrice is undefined", () => {
    it("returns undefined", async () => {
      const price = getGasPrice(chainIds.mainnet, {});
      expect(price).to.equal(undefined);
    });
    describe("when chain has no default", () => {
      it("returns undefined", async () => {
        const price = getGasPrice(chainIds.mainnet, {});
        expect(price).to.equal(undefined);
      });
    });
    describe("when chain has a default", () => {
      it("returns the default", async () => {
        const price = getGasPrice(chainIds.hardhat, {});
        expect(BigNumber.from(100000000000).eq(price as BigNumber)).to.equal(true);
      });
    });
  });
  describe("when gasPrice is a number", () => {
  });
  describe("when gasPrice is a hex string", () => {
  });
  describe("when gasPrice is an invalid string", () => {
  })
});
