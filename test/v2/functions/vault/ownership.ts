import { expect } from "chai";
import { ZERO_ADDRESS } from "../../constants";

export function testOwnership(): void {
  describe("Renounce Ownership", function () {
    describe("should be reverted", function () {
      it("when called from non-owner", async function () {
        await expect(
          this.vault.connect(this.signers.user).renounceOwnership(),
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("when called from owner", async function () {
        await expect(this.vault.renounceOwnership()).to.be.revertedWith(
          "Aera__VaultIsNotRenounceable",
        );
      });
    });
  });

  describe("Offer Ownership Transfer", function () {
    describe("should be reverted", function () {
      it("when called from non-owner", async function () {
        await expect(
          this.vault
            .connect(this.signers.user)
            .transferOwnership(this.signers.admin.address),
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("when called from not accepted owner", async function () {
        await this.vault.transferOwnership(this.signers.user.address);
        await expect(
          this.vault
            .connect(this.signers.user)
            .transferOwnership(this.signers.admin.address),
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("when transferred ownership", async function () {
        await this.vault.transferOwnership(this.signers.user.address);
        await this.vault.connect(this.signers.user).acceptOwnership();
        await expect(
          this.vault.transferOwnership(this.signers.user.address),
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("when new owner is zero address", async function () {
        await expect(
          this.vault.transferOwnership(ZERO_ADDRESS),
        ).to.be.revertedWith("Aera__OwnerIsZeroAddress");
      });
    });

    it("should be possible to call", async function () {
      expect(await this.vault.pendingOwner()).to.equal(ZERO_ADDRESS);
      await this.vault.transferOwnership(this.signers.user.address);
      expect(await this.vault.pendingOwner()).to.equal(
        this.signers.user.address,
      );
    });
  });

  describe("Cancel Ownership Transfer", function () {
    describe("should be reverted", function () {
      it("when called from non-owner", async function () {
        await expect(
          this.vault.connect(this.signers.user).cancelOwnershipTransfer(),
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("when there is no pending ownership transfer", async function () {
        await expect(this.vault.cancelOwnershipTransfer()).to.be.revertedWith(
          "Aera__NoPendingOwnershipTransfer",
        );
      });
    });

    it("should be possible to cancel", async function () {
      await this.vault.transferOwnership(this.signers.user.address);
      expect(await this.vault.pendingOwner()).to.equal(
        this.signers.user.address,
      );
      await this.vault.cancelOwnershipTransfer();
      expect(await this.vault.pendingOwner()).to.equal(ZERO_ADDRESS);
      await expect(
        this.vault.connect(this.signers.user).acceptOwnership(),
      ).to.be.revertedWith("Aera__NotPendingOwner");
    });
  });

  describe("Accept Ownership", function () {
    describe("should be reverted", function () {
      it("when called from not pending owner", async function () {
        await this.vault.transferOwnership(this.signers.user.address);
        await expect(this.vault.acceptOwnership()).to.be.revertedWith(
          "Aera__NotPendingOwner",
        );
      });
    });

    it("should be possible to accept", async function () {
      await this.vault.transferOwnership(this.signers.user.address);
      expect(await this.vault.owner()).to.equal(this.signers.admin.address);
      expect(await this.vault.pendingOwner()).to.equal(
        this.signers.user.address,
      );
      await this.vault.connect(this.signers.user).acceptOwnership();
      expect(await this.vault.owner()).to.equal(this.signers.user.address);
      await this.vault
        .connect(this.signers.user)
        .transferOwnership(this.signers.admin.address);
    });
  });
}
