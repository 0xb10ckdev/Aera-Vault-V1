import { expect } from "chai";

export function testSetOraclesEnabled(): void {
  describe("should be reverted to enable/disable oracle", async function () {
    it("when called from non-owner or non-guardian", async function () {
      await expect(
        this.vault.connect(this.signers.user).setOraclesEnabled(true),
      ).to.be.revertedWith("Aera__CallerIsNotOwnerOrGuardian");
    });
  });

  it("should be possible to enable/disable oracle", async function () {
    await expect(this.vault.setOraclesEnabled(true))
      .to.emit(this.vault, "SetOraclesEnabled")
      .withArgs(true);

    expect(await this.vault.oraclesEnabled()).to.equal(true);

    await expect(this.vault.setOraclesEnabled(false))
      .to.emit(this.vault, "SetOraclesEnabled")
      .withArgs(false);

    expect(await this.vault.oraclesEnabled()).to.equal(false);
  });
}
