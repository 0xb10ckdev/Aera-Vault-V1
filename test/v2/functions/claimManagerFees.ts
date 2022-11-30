import { expect } from "chai";
import { BigNumber } from "ethers";
import { MAX_MANAGEMENT_FEE, ONE } from "../constants";
import {
  getTimestamp,
  normalizeWeights,
  tokenValueArray,
  tokenWithValues,
  toUnit,
  toWei,
  valueArray,
} from "../utils";

export function testClaimManagerFees(): void {
  beforeEach(async function () {
    for (let i = 0; i < this.tokens.length; i++) {
      await this.tokens[i].approve(this.vault.address, ONE);
    }

    for (let i = 1; i < this.poolTokens.length; i++) {
      await this.oracles[i].setLatestAnswer(toUnit(1, 8));
    }

    await this.vault.initialDeposit(
      tokenValueArray(this.tokenAddresses, ONE, this.tokens.length),
      tokenWithValues(
        this.tokenAddresses,
        normalizeWeights(valueArray(ONE, this.tokens.length)),
      ),
    );
  });

  it("should be reverted to claim manager fees when no available fee", async function () {
    for (let i = 0; i < this.tokens.length; i++) {
      await this.tokens[i].approve(this.vault.address, toWei(100000));
    }
    await this.vault.depositRiskingArbitrage(
      tokenValueArray(this.tokenAddresses, toWei(10000), this.tokens.length),
    );

    await expect(this.vault.claimManagerFees()).to.be.revertedWith(
      "Aera__NoAvailableFeeForCaller",
    );
  });

  describe("should be possible to claim manager fees", async function () {
    it("when called from current manager", async function () {
      for (let i = 0; i < this.tokens.length; i++) {
        await this.tokens[i].approve(this.vault.address, toWei(100000));
      }

      let lastFeeCheckpoint = (
        await this.vault.lastFeeCheckpoint()
      ).toNumber();
      let holdings = await this.vault.getHoldings();
      const managerBalances = await this.getUserBalances(this.manager.address);
      const depositTrx = await this.vault.depositRiskingArbitrage(
        tokenValueArray(this.tokenAddresses, toWei(10000), this.tokens.length),
      );

      let currentTime = await getTimestamp(depositTrx.blockNumber);
      const managerFee = holdings.map((holding: BigNumber) =>
        holding
          .mul(currentTime - lastFeeCheckpoint)
          .mul(MAX_MANAGEMENT_FEE)
          .div(ONE),
      );
      lastFeeCheckpoint = currentTime;

      holdings = await this.vault.getHoldings();

      const trx = await this.vault.connect(this.manager).claimManagerFees();

      const newManagerBalances = await this.getUserBalances(
        this.manager.address,
      );

      currentTime = await getTimestamp(trx.blockNumber);
      holdings.forEach((holding: BigNumber, index: number) => {
        managerFee[index] = managerFee[index].add(
          holding
            .mul(currentTime - lastFeeCheckpoint)
            .mul(MAX_MANAGEMENT_FEE)
            .div(ONE),
        );
        expect(newManagerBalances[index]).to.equal(
          managerBalances[index].add(managerFee[index]),
        );
      });

      await expect(trx)
        .to.emit(this.vault, "DistributeManagerFees")
        .withArgs(this.manager.address, managerFee);
    });

    it("when called from old manager", async function () {
      for (let i = 0; i < this.tokens.length; i++) {
        await this.tokens[i].approve(this.vault.address, toWei(100000));
      }

      let lastFeeCheckpoint = (
        await this.vault.lastFeeCheckpoint()
      ).toNumber();
      let holdings = await this.vault.getHoldings();
      const managerBalances = await this.getUserBalances(this.manager.address);
      const depositTrx = await this.vault.depositRiskingArbitrage(
        tokenValueArray(this.tokenAddresses, toWei(10000), this.tokens.length),
      );

      let currentTime = await getTimestamp(depositTrx.blockNumber);
      const managerFee = holdings.map((holding: BigNumber) =>
        holding
          .mul(currentTime - lastFeeCheckpoint)
          .mul(MAX_MANAGEMENT_FEE)
          .div(ONE),
      );
      lastFeeCheckpoint = currentTime;

      holdings = (await this.getState()).holdings;
      const setManagerTrx = await this.vault.setManager(this.user.address);

      currentTime = await getTimestamp(setManagerTrx.blockNumber);
      holdings.forEach((holding: BigNumber, index: number) => {
        managerFee[index] = managerFee[index].add(
          holding
            .mul(currentTime - lastFeeCheckpoint)
            .mul(MAX_MANAGEMENT_FEE)
            .div(ONE),
        );
      });

      await expect(this.vault.connect(this.manager).claimManagerFees())
        .to.emit(this.vault, "DistributeManagerFees")
        .withArgs(this.manager.address, managerFee);

      const newManagerBalances = await this.getUserBalances(
        this.manager.address,
      );

      newManagerBalances.forEach(
        (managerBalance: BigNumber, index: number) => {
          expect(managerBalance).to.equal(
            managerBalances[index].add(managerFee[index]),
          );
        },
      );
    });
  });
}
