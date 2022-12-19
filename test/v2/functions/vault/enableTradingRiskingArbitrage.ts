import { expect } from "chai";

export function testEnableTradingRiskingArbitrage(): void {
  it("should be reverted to enable trading when called from non-owner", async function () {
    await expect(
      this.vault.connect(this.signers.manager).enableTradingRiskingArbitrage(),
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("should be possible to enable trading", async function () {
    const weights = await this.vault.getNormalizedWeights();

    await expect(this.vault.enableTradingRiskingArbitrage())
      .to.emit(this.vault, "SetSwapEnabled")
      .withArgs(true);

    const currentWeights = await this.vault.getNormalizedWeights();

    expect(await this.vault.isSwapEnabled()).to.equal(true);
    for (let i = 0; i < this.numTokens; i++) {
      expect(weights[i]).to.equal(currentWeights[i]);
    }
  });
}
