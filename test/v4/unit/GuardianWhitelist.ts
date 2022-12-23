import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import hre, { ethers } from "hardhat";
import {
  GuardianWhitelist,
  GuardianWhitelistFactory,
} from "../../../typechain";
import { ZERO_ADDRESS } from "../constants";
import { deployGuardianWhitelist } from "../utils";

describe("GuardianWhitelist Deployment", function () {
  let admin: SignerWithAddress;
  let guardian: SignerWithAddress;
  let snapshot: unknown;

  describe("should be reverted to deploy vault", async () => {
    before(async function () {
      snapshot = await ethers.provider.send("evm_snapshot", []);
      ({ admin, guardian } = await ethers.getNamedSigners());
    });

    after(async () => {
      await ethers.provider.send("evm_revert", [snapshot]);
    });

    it("when initialization list has a zero address", async () => {
      await expect(
        deployGuardianWhitelist(admin, [ZERO_ADDRESS]),
      ).to.be.revertedWith("Aera__GuardianIsZeroAddress");
    });

    it("when guardians are duplicated in initialization list", async () => {
      await expect(
        deployGuardianWhitelist(admin, [guardian.address, guardian.address]),
      ).to.be.revertedWith("Aera__AddressIsAlreadyGuardian");
    });
  });
});

describe("GuardianWhitelist Functionality", function () {
  let guardian: SignerWithAddress;
  let users: SignerWithAddress[];
  let factory: GuardianWhitelistFactory;
  let guardianWhitelist: GuardianWhitelist;
  let snapshot: unknown;

  beforeEach(async function () {
    snapshot = await ethers.provider.send("evm_snapshot", []);

    const signers = await ethers.getSigners();
    guardian = signers[1];
    users = signers.slice(2);

    factory = await hre.run("deploy:guardianWhitelistFactory", {
      silent: true,
    });

    guardianWhitelist = await hre.run("deploy:guardianWhitelist", {
      factory: factory.address,
      salt: "1",
      silent: true,
    });
  });

  afterEach(async () => {
    await ethers.provider.send("evm_revert", [snapshot]);
  });

  it("GuardianWhitelist should be deployed on precomputed address", async () => {
    const precomputedAddress = await factory.computeAddress([], 1);
    expect(guardianWhitelist.address).to.be.equal(precomputedAddress);
  });

  describe("Add Guardian", () => {
    describe("should be reverted to add a new guardian", () => {
      it("when called from non-owner", async () => {
        await expect(
          guardianWhitelist.connect(guardian).addGuardian(guardian.address),
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("when a guardian is zero address", async () => {
        await expect(
          guardianWhitelist.addGuardian(ZERO_ADDRESS),
        ).to.be.revertedWith("Aera__GuardianIsZeroAddress");
      });

      it("when a guardian is already present", async () => {
        await guardianWhitelist.addGuardian(guardian.address);
        await expect(
          guardianWhitelist.addGuardian(guardian.address),
        ).to.be.revertedWith("Aera__AddressIsAlreadyGuardian");
      });
    });

    it("should be possible to add a new guardian", async () => {
      for (let i = 0; i < users.length; i++) {
        expect(await guardianWhitelist.isGuardian(users[i].address)).to.be
          .false;

        await guardianWhitelist.addGuardian(users[i].address);

        expect(await guardianWhitelist.isGuardian(users[i].address)).to.be
          .true;
        expect(await guardianWhitelist.getGuardians()).to.be.eql(
          users.slice(0, i + 1).map(user => user.address),
        );
      }
    });
  });

  describe("Remove Guardian", () => {
    beforeEach(async function () {
      for (let i = 0; i < users.length; i++) {
        await guardianWhitelist.addGuardian(users[i].address);
      }
    });

    describe("should be reverted to remove a guardian", () => {
      it("when called from non-owner", async () => {
        await expect(
          guardianWhitelist.connect(guardian).removeGuardian(guardian.address),
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("when a guardian isn't present", async () => {
        await expect(
          guardianWhitelist.removeGuardian(guardian.address),
        ).to.be.revertedWith("Aera__AddressIsNotGuardian");
      });
    });

    it("should be possible to remove a guardian", async () => {
      for (let i = 0; i < users.length; i++) {
        expect(await guardianWhitelist.isGuardian(users[i].address)).to.be
          .true;

        const guardians = await guardianWhitelist.getGuardians();

        await guardianWhitelist.removeGuardian(users[i].address);

        const guardianIndex = guardians.findIndex(
          (address: string) => address == users[i].address,
        );
        let newGuardians = [...guardians];
        newGuardians[guardianIndex] = guardians[guardians.length - 1];
        newGuardians = newGuardians.slice(0, guardians.length - 1);

        expect(await guardianWhitelist.isGuardian(users[i].address)).to.be
          .false;
        expect(await guardianWhitelist.getGuardians()).to.be.eql(newGuardians);
      }
    });
  });

  describe("Add and remove Guardians", () => {
    it("should be possible to add and remove guardians", async () => {
      for (let i = 0; i < users.length; i++) {
        expect(await guardianWhitelist.isGuardian(users[i].address)).to.be
          .false;

        await guardianWhitelist.addGuardian(users[i].address);

        expect(await guardianWhitelist.isGuardian(users[i].address)).to.be
          .true;
        expect(await guardianWhitelist.getGuardians()).to.be.eql(
          users.slice(0, i + 1).map(user => user.address),
        );
      }

      for (let i = 0; i < users.length; i++) {
        expect(await guardianWhitelist.isGuardian(users[i].address)).to.be
          .true;

        const guardians = await guardianWhitelist.getGuardians();

        await guardianWhitelist.removeGuardian(users[i].address);

        const guardianIndex = guardians.findIndex(
          (address: string) => address == users[i].address,
        );
        let newGuardians = [...guardians];
        newGuardians[guardianIndex] = guardians[guardians.length - 1];
        newGuardians = newGuardians.slice(0, guardians.length - 1);

        expect(await guardianWhitelist.isGuardian(users[i].address)).to.be
          .false;
        expect(await guardianWhitelist.getGuardians()).to.be.eql(newGuardians);
      }
    });
  });
});
