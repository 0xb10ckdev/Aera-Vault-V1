import { chainIds } from "../../hardhat.config";
import { getConfig, getGasLimit, getGasPrice, getBVault, getMerkleOrchard } from "../../scripts/config";
import { expect, assert } from "chai";
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
    describe("when chain has no default", () => {
      it("returns undefined", async () => {
        const price = getGasPrice(chainIds.mainnet);
        expect(price).to.equal(undefined);
      });
    });
    describe("when chain has a default", () => {
      it("returns the default", async () => {
        const price = getGasPrice(chainIds.hardhat);
        expect(BigNumber.from(100000000000).eq(price as BigNumber)).to.equal(true);
      });
    });
  });
  describe("when input is a number", () => {
    it("converts to bignumber and returns", async () => {
      const price = getGasPrice(chainIds.hardhat, 2);
      expect(BigNumber.from(2).eq(price as BigNumber)).to.equal(true);
    });
  });
  describe("when input is a hex string", () => {
    it("converts to bignumber and returns", async () => {
      const price = getGasPrice(chainIds.hardhat, "0x2");
      expect(BigNumber.from("0x2").eq(price as BigNumber)).to.equal(true);
    });
  });
  describe("when input is an invalid string", () => {
    it("converts to bignumber and returns", async () => {
      assert.throws(() => getGasPrice(chainIds.hardhat, "invalid"), Error, "invalid BigNumber string");
    });
  })
});

describe("getGasLimit", () => {
  describe("when gasLimit is undefined", () => {
    describe("when chain has no default", () => {
      it("returns undefined", async () => {
        const limit = getGasLimit(chainIds.mainnet);
        expect(limit).to.equal(undefined);
      });
    });
    describe("when chain has a default", () => {
      it("returns the default", async () => {
        const limit = getGasLimit(chainIds.hardhat);
        expect(limit).to.equal(3000000);
      });
    });
  });
  describe("when input is a number", () => {
    it("returns the number", async () => {
      const limit = getGasLimit(chainIds.hardhat, 2);
      expect(limit).to.equal(2);
    });
  });
});
describe("getConfig", () => {
  describe("with unsupported network", () => {
    it("throws", async () => {
      assert.throws(() => getConfig(1000), "unsupported chain ID");
    });
  });
  describe("with defaults from hardhat network", () => {
    it("returns the correct config", async () => {
      const config = getConfig(chainIds.hardhat);
      expect(config.bVault).to.equal("0xBA12222222228d8Ba445958a75a0704d566BF2C8");
      expect(config.merkleOrchard).to.equal(undefined);
      expect(config.gasPrice).to.equal(BigNumber.from(100000000000));
      expect(config.gasLimit).to.equal(3000000);
    })
  });
  describe("with defaults from mainnet", () => {
    it("returns the correct config", async () => {
      const config = getConfig(chainIds.mainnet);
      expect(config.bVault).to.equal("0xBA12222222228d8Ba445958a75a0704d566BF2C8");
      expect(config.merkleOrchard).to.equal("0xdAE7e32ADc5d490a43cCba1f0c736033F2b4eFca");
      expect(config.gasPrice).to.equal(undefined);
      expect(config.gasLimit).to.equal(undefined);
    })
  });
  describe("with gas price", () => {
    it("returns the correct config", async () => {
      const config = getConfig(chainIds.hardhat, {gasPrice: 2});
      expect(config.bVault).to.equal("0xBA12222222228d8Ba445958a75a0704d566BF2C8");
      expect(config.merkleOrchard).to.equal(undefined);
      expect(config.gasPrice).to.equal(BigNumber.from(2));
      expect(config.gasLimit).to.equal(3000000);
    });
  });
  describe("with gas limit", () => {
    it("returns the correct config", async () => {
      const config = getConfig(chainIds.hardhat, {gasLimit: 2});
      expect(config.bVault).to.equal("0xBA12222222228d8Ba445958a75a0704d566BF2C8");
      expect(config.merkleOrchard).to.equal(undefined);
      expect(config.gasPrice).to.equal(BigNumber.from(100000000000));
      expect(config.gasLimit).to.equal(2);
    });
  });
})
