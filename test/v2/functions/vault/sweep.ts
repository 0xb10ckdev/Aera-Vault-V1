import { expect } from "chai";
import { IERC20 } from "../../../../typechain";
import { ONE } from "../../constants";
import { deployToken } from "../../fixtures";
import { toWei } from "../../utils";

export function testSweep(): void {
  let TOKEN: IERC20;
  beforeEach(async function () {
    ({ TOKEN } = await deployToken());
  });

  describe("should be reverted to withdraw token", async function () {
    beforeEach(async function () {
      await TOKEN.transfer(this.vault.address, toWei(1000));
    });

    it("when called from non-owner", async function () {
      await expect(
        this.vault
          .connect(this.signers.manager)
          .sweep(TOKEN.address, toWei(1001)),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("when token is pool token", async function () {
      const poolToken = await this.vault.pool();
      await expect(this.vault.sweep(poolToken, ONE)).to.be.revertedWith(
        "Aera__CannotSweepPoolToken",
      );
    });

    it("when amount exceeds balance", async function () {
      await expect(
        this.vault.sweep(TOKEN.address, toWei(1001)),
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
  });

  it("should be possible to withdraw token", async function () {
    const balance = await TOKEN.balanceOf(this.signers.admin.address);
    await TOKEN.transfer(this.vault.address, toWei(1000));

    expect(
      await this.vault.estimateGas.sweep(TOKEN.address, toWei(1000)),
    ).to.below(70000);
    await this.vault.sweep(TOKEN.address, toWei(1000));

    expect(await TOKEN.balanceOf(this.vault.address)).to.equal(toWei(0));

    expect(await TOKEN.balanceOf(this.signers.admin.address)).to.equal(
      balance,
    );
  });
}
