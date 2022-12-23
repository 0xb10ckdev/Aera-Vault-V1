import { expect } from "chai";
import { BigNumber } from "ethers";
import { MAX_MANAGEMENT_FEE, ONE } from "../../constants";
import {
  getTimestamp,
  normalizeWeights,
  tokenValueArray,
  tokenWithValues,
  toUnit,
  toWei,
  valueArray,
} from "../../utils";

export function testClaimGuardianFees(): void {
  beforeEach(async function () {
    for (let i = 0; i < this.numTokens; i++) {
      await this.tokens[i].approve(this.vault.address, ONE);
    }

    for (let i = 1; i < this.numPoolTokens; i++) {
      await this.oracles[i].setLatestAnswer(toUnit(1, 8));
    }

    await this.vault.initialDeposit(
      tokenValueArray(this.tokenAddresses, ONE, this.numTokens),
      tokenWithValues(
        this.tokenAddresses,
        normalizeWeights(valueArray(ONE, this.numTokens)),
      ),
    );
  });

  it("should be reverted to claim guardian fees when no available fee", async function () {
    for (let i = 0; i < this.numTokens; i++) {
      await this.tokens[i].approve(this.vault.address, toWei(100000));
    }
    await this.vault.depositRiskingArbitrage(
      tokenValueArray(this.tokenAddresses, toWei(10000), this.numTokens),
    );

    await expect(this.vault.claimGuardianFees()).to.be.revertedWith(
      "Aera__NoAvailableFeeForCaller",
    );
  });

  describe("should be possible to claim guardian fees", async function () {
    it("when called from current guardian", async function () {
      for (let i = 0; i < this.numTokens; i++) {
        await this.tokens[i].approve(this.vault.address, toWei(100000));
      }

      let lastFeeCheckpoint = (
        await this.vault.lastFeeCheckpoint()
      ).toNumber();
      let holdings = await this.vault.getHoldings();
      const guardianBalances = await this.getUserBalances(
        this.signers.guardian.address,
      );
      const depositTrx = await this.vault.depositRiskingArbitrage(
        tokenValueArray(this.tokenAddresses, toWei(10000), this.numTokens),
      );

      let currentTime = await getTimestamp(depositTrx.blockNumber);
      const guardianFee = holdings.map((holding: BigNumber) =>
        holding
          .mul(currentTime - lastFeeCheckpoint)
          .mul(MAX_MANAGEMENT_FEE)
          .div(ONE),
      );
      lastFeeCheckpoint = currentTime;

      holdings = await this.vault.getHoldings();

      const trx = await this.vault
        .connect(this.signers.guardian)
        .claimGuardianFees();

      const newGuardianBalances = await this.getUserBalances(
        this.signers.guardian.address,
      );

      currentTime = await getTimestamp(trx.blockNumber);
      holdings.forEach((holding: BigNumber, index: number) => {
        guardianFee[index] = guardianFee[index].add(
          holding
            .mul(currentTime - lastFeeCheckpoint)
            .mul(MAX_MANAGEMENT_FEE)
            .div(ONE),
        );
        expect(newGuardianBalances[index]).to.equal(
          guardianBalances[index].add(guardianFee[index]),
        );
      });

      await expect(trx)
        .to.emit(this.vault, "DistributeGuardianFees")
        .withArgs(this.signers.guardian.address, guardianFee);
    });

    it("when called from old guardian", async function () {
      for (let i = 0; i < this.numTokens; i++) {
        await this.tokens[i].approve(this.vault.address, toWei(100000));
      }

      let lastFeeCheckpoint = (
        await this.vault.lastFeeCheckpoint()
      ).toNumber();
      let holdings = await this.vault.getHoldings();
      const guardianBalances = await this.getUserBalances(
        this.signers.guardian.address,
      );
      const depositTrx = await this.vault.depositRiskingArbitrage(
        tokenValueArray(this.tokenAddresses, toWei(10000), this.numTokens),
      );

      let currentTime = await getTimestamp(depositTrx.blockNumber);
      const guardianFee = holdings.map((holding: BigNumber) =>
        holding
          .mul(currentTime - lastFeeCheckpoint)
          .mul(MAX_MANAGEMENT_FEE)
          .div(ONE),
      );
      lastFeeCheckpoint = currentTime;

      holdings = (await this.getState()).holdings;
      const setGuardianTrx = await this.vault.setGuardian(
        this.signers.user.address,
      );

      currentTime = await getTimestamp(setGuardianTrx.blockNumber);
      holdings.forEach((holding: BigNumber, index: number) => {
        guardianFee[index] = guardianFee[index].add(
          holding
            .mul(currentTime - lastFeeCheckpoint)
            .mul(MAX_MANAGEMENT_FEE)
            .div(ONE),
        );
      });

      await expect(
        this.vault.connect(this.signers.guardian).claimGuardianFees(),
      )
        .to.emit(this.vault, "DistributeGuardianFees")
        .withArgs(this.signers.guardian.address, guardianFee);

      const newGuardianBalances = await this.getUserBalances(
        this.signers.guardian.address,
      );

      newGuardianBalances.forEach(
        (guardianBalance: BigNumber, index: number) => {
          expect(guardianBalance).to.equal(
            guardianBalances[index].add(guardianFee[index]),
          );
        },
      );
    });
  });
}
