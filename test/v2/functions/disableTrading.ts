import { expect } from "chai";
import { ONE } from "../constants";
import {
  normalizeWeights,
  tokenValueArray,
  tokenWithValues,
  toUnit,
  valueArray,
} from "../utils";

export function testDisableTrading(): void {
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

  it("should be reverted to disable trading", async function () {
    await expect(
      this.vault.connect(this.user).disableTrading(),
    ).to.be.revertedWith("Aera__CallerIsNotOwnerOrManager");
  });

  it("should be possible to disable trading", async function () {
    expect(await this.vault.isSwapEnabled()).to.equal(true);

    expect(await this.vault.estimateGas.disableTrading()).to.below(52000);

    await expect(this.vault.connect(this.manager).disableTrading())
      .to.emit(this.vault, "SetSwapEnabled")
      .withArgs(false);

    expect(await this.vault.isSwapEnabled()).to.equal(false);
  });
}
