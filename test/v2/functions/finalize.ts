import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import {
  MAX_MANAGEMENT_FEE,
  MIN_FEE_DURATION,
  MIN_WEIGHT,
  ONE,
} from "../constants";
import {
  getTimestamp,
  normalizeWeights,
  tokenValueArray,
  tokenWithValues,
  valueArray,
} from "../utils";

export function testFinalize(): void {
  describe("should be reverted to call finalize", async function () {
    it("when called from non-owner", async function () {
      await expect(
        this.vault.connect(this.user).finalize(),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("when already finalized", async function () {
      await this.vault.finalize();

      await expect(this.vault.finalize()).to.be.revertedWith(
        "Aera__VaultIsFinalized",
      );
    });
  });

  describe("should be reverted to call functions when finalized", async function () {
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
  });

  it("should be possible to finalize", async function () {
    const { holdings, adminBalances } = await this.getState();

    const createdAt = await this.vault.createdAt();
    const lastFeeCheckpoint = await this.vault.lastFeeCheckpoint();

    const trx = await this.vault.finalize();
    expect(await this.vault.isSwapEnabled()).to.equal(false);

    const currentTime = await getTimestamp(trx.blockNumber);
    const feeIndex =
      Math.max(0, currentTime - lastFeeCheckpoint.toNumber()) +
      Math.max(0, createdAt.toNumber() + MIN_FEE_DURATION - currentTime);

    const newHoldings: BigNumber[] = [];
    holdings.forEach((holding: BigNumber) => {
      newHoldings.push(
        holding.sub(holding.mul(MAX_MANAGEMENT_FEE).mul(feeIndex).div(ONE)),
      );
    });

    const newAdminBalances = await this.getUserBalances(this.admin.address);

    for (let i = 0; i < this.tokens.length; i++) {
      expect(newAdminBalances[i]).to.equal(
        adminBalances[i].add(newHoldings[i]),
      );
    }
  });
}
