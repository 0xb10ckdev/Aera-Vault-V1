import { expect } from "chai";
import { ZERO_ADDRESS } from "../../constants";

export function testSetManager(): void {
  describe("should be reverted to change manager", async function () {
    it("when called from non-owner", async function () {
      await expect(
        this.vault.connect(this.signers.manager).setManager(ZERO_ADDRESS),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("when parameter(new manager) is zero address", async function () {
      await expect(this.vault.setManager(ZERO_ADDRESS)).to.be.revertedWith(
        "Aera__ManagerIsZeroAddress",
      );
    });

    it("when parameter(new manager) is owner", async function () {
      await expect(
        this.vault.setManager(this.signers.admin.address),
      ).to.be.revertedWith("Aera__ManagerIsOwner");
    });
  });

  it("should be possible to change manager", async function () {
    expect(await this.vault.manager()).to.equal(this.signers.manager.address);

    await expect(this.vault.setManager(this.signers.user.address))
      .to.emit(this.vault, "ManagerChanged")
      .withArgs(this.signers.manager.address, this.signers.user.address);

    expect(await this.vault.manager()).to.equal(this.signers.user.address);
  });
}
