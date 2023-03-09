
import { getConfig, getBVault } from "../../scripts/config";
import { expect } from "chai";
describe("getBVault", () => {
  it("gets default bvault when undefined", async () => {
    const badChain = 100000;
    const bvault = getBVault(badChain);
    expect(bvault).to.equal("0xBA12222222228d8Ba445958a75a0704d566BF2C8");
  });
});
