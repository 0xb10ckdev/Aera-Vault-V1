import { expect } from "chai";
import { BigNumber } from "ethers";
import { MAX_MANAGEMENT_FEE, MIN_FEE_DURATION, ONE } from "../../constants";
import { getTimestamp } from "../../utils";

export function testFinalize(): void {
  describe("should be reverted to call finalize", async function () {
    it("when called from non-owner", async function () {
      await expect(
        this.vault.connect(this.signers.user).finalize(),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("when already finalized", async function () {
      await this.vault.finalize();

      await expect(this.vault.finalize()).to.be.revertedWith(
        "Aera__VaultIsFinalized",
      );
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

    await expect(trx)
      .to.emit(this.vault, "Finalized")
      .withArgs(this.signers.admin.address, newHoldings);

    const newAdminBalances = await this.getUserBalances(
      this.signers.admin.address,
    );

    for (let i = 0; i < this.tokens.length; i++) {
      expect(newAdminBalances[i]).to.equal(
        adminBalances[i].add(newHoldings[i]),
      );
    }
  });
}
