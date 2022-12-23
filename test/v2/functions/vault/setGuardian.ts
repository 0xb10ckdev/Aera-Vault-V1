import { expect } from "chai";
import { ZERO_ADDRESS } from "../../constants";

export function testSetGuardian(): void {
  describe("should be reverted to change guardian", async function () {
    it("when called from non-owner", async function () {
      await expect(
        this.vault.connect(this.signers.guardian).setGuardian(ZERO_ADDRESS),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("when parameter(new guardian) is zero address", async function () {
      await expect(this.vault.setGuardian(ZERO_ADDRESS)).to.be.revertedWith(
        "Aera__GuardianIsZeroAddress",
      );
    });

    it("when parameter(new guardian) is owner", async function () {
      await expect(
        this.vault.setGuardian(this.signers.admin.address),
      ).to.be.revertedWith("Aera__GuardianIsOwner");
    });
  });

  it("should be possible to change guardian", async function () {
    expect(await this.vault.guardian()).to.equal(
      this.signers.guardian.address,
    );

    await expect(this.vault.setGuardian(this.signers.user.address))
      .to.emit(this.vault, "GuardianChanged")
      .withArgs(this.signers.guardian.address, this.signers.user.address);

    expect(await this.vault.guardian()).to.equal(this.signers.user.address);
  });
}
