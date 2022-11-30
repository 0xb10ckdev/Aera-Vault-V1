import { expect } from "chai";
import { ethers } from "hardhat";
import { MIN_WEIGHT, ONE } from "../constants";
import {
  normalizeWeights,
  tokenValueArray,
  tokenWithValues,
  valueArray,
} from "../utils";

export function testFunctionCallsWhenFinalized(): void {
  beforeEach(async function () {
    await this.vault.finalize();
  });

  it("when call deposit", async function () {
    await expect(
      this.vault.deposit(
        tokenValueArray(this.tokenAddresses, ONE, this.tokens.length),
      ),
    ).to.be.revertedWith("Aera__VaultIsFinalized");
  });

  it("when call depositIfBalanceUnchanged", async function () {
    await expect(
      this.vault.depositIfBalanceUnchanged(
        tokenValueArray(this.tokenAddresses, ONE, this.tokens.length),
      ),
    ).to.be.revertedWith("Aera__VaultIsFinalized");
  });

  it("when call depositRiskingArbitrage", async function () {
    await expect(
      this.vault.depositRiskingArbitrage(
        tokenValueArray(this.tokenAddresses, ONE, this.tokens.length),
      ),
    ).to.be.revertedWith("Aera__VaultIsFinalized");
  });

  it("when call depositRiskingArbitrageIfBalanceUnchanged", async function () {
    await expect(
      this.vault.depositRiskingArbitrageIfBalanceUnchanged(
        tokenValueArray(this.tokenAddresses, ONE, this.tokens.length),
      ),
    ).to.be.revertedWith("Aera__VaultIsFinalized");
  });

  it("when call withdraw", async function () {
    await expect(
      this.vault.withdraw(
        tokenValueArray(this.tokenAddresses, ONE, this.tokens.length),
      ),
    ).to.be.revertedWith("Aera__VaultIsFinalized");
  });

  it("when call withdrawIfBalanceUnchanged", async function () {
    await expect(
      this.vault.withdrawIfBalanceUnchanged(
        tokenValueArray(this.tokenAddresses, ONE, this.tokens.length),
      ),
    ).to.be.revertedWith("Aera__VaultIsFinalized");
  });

  it("when call updateWeightsGradually", async function () {
    const blocknumber = await ethers.provider.getBlockNumber();
    await expect(
      this.vault
        .connect(this.manager)
        .updateWeightsGradually(
          tokenWithValues(
            this.tokenAddresses,
            normalizeWeights(valueArray(MIN_WEIGHT, this.tokens.length)),
          ),
          blocknumber + 1,
          blocknumber + 1000,
        ),
    ).to.be.revertedWith("Aera__VaultIsFinalized");
  });

  it("when call cancelWeightUpdates", async function () {
    await expect(
      this.vault.connect(this.manager).cancelWeightUpdates(),
    ).to.be.revertedWith("Aera__VaultIsFinalized");
  });

  it("when call claimManagerFees", async function () {
    await expect(
      this.vault.connect(this.manager).claimManagerFees(),
    ).to.be.revertedWith("Aera__VaultIsFinalized");
  });
}
