import { expect } from "chai";
import { ONE } from "../../constants";
import {
  normalizeWeights,
  tokenValueArray,
  tokenWithValues,
  toUnit,
  valueArray,
} from "../../utils";

export function testDisableTrading(): void {
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

  it("should be reverted to disable trading", async function () {
    await expect(
      this.vault.connect(this.signers.user).disableTrading(),
    ).to.be.revertedWith("Aera__CallerIsNotOwnerOrManager");
  });

  it("should be possible to disable trading", async function () {
    expect(await this.vault.isSwapEnabled()).to.equal(true);

    expect(await this.vault.estimateGas.disableTrading()).to.below(52000);

    await expect(this.vault.connect(this.signers.manager).disableTrading())
      .to.emit(this.vault, "SetSwapEnabled")
      .withArgs(false);

    expect(await this.vault.isSwapEnabled()).to.equal(false);
  });
}
