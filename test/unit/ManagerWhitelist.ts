import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { ManagerWhitelist, ManagerWhitelistFactory } from "../../typechain";
import { ZERO_ADDRESS } from "../constants";
import { deployManagerWhitelist } from "../utils";

describe("ManagerWhitelist Deployment", function () {
  let admin: SignerWithAddress;
  let manager: SignerWithAddress;
  let snapshot: unknown;

  describe("should be reverted to deploy vault", async () => {
    before(async function () {
      snapshot = await ethers.provider.send("evm_snapshot", []);
      ({ admin, manager } = await ethers.getNamedSigners());
    });

    after(async () => {
      await ethers.provider.send("evm_revert", [snapshot]);
    });

    it("when initialization list has a zero address", async () => {
      await expect(
        deployManagerWhitelist(admin, [ZERO_ADDRESS]),
      ).to.be.revertedWith("Mammon__ManagerIsZeroAddress");
    });

    it("when managers are duplicated in initialization list", async () => {
      await expect(
        deployManagerWhitelist(admin, [manager.address, manager.address]),
      ).to.be.revertedWith("Mammon__AddressIsAlreadyManager");
    });
  });
});

describe("ManagerWhitelist Functionality", function () {
  let manager: SignerWithAddress;
  let users: SignerWithAddress[];
  let factory: ManagerWhitelistFactory;
  let managerWhitelist: ManagerWhitelist;
  let snapshot: unknown;

  beforeEach(async function () {
    snapshot = await ethers.provider.send("evm_snapshot", []);

    const signers = await ethers.getSigners();
    manager = signers[1];
    users = signers.slice(2);

    factory = await hre.run("deploy:managerWhitelistFactory", {
      silent: true,
    });

    managerWhitelist = await hre.run("deploy:managerWhitelist", {
      factory: factory.address,
      salt: "1",
      silent: true,
    });
  });

  afterEach(async () => {
    await ethers.provider.send("evm_revert", [snapshot]);
  });

  it("ManagerWhitelist should be deployed on precomputed address", async () => {
    const precomputedAddress = await factory.computeAddress([], 1);
    expect(managerWhitelist.address).to.be.equal(precomputedAddress);
  });

  describe("Add Manager", () => {
    describe("should be reverted to add a new manager", () => {
      it("when called from non-owner", async () => {
        await expect(
          managerWhitelist.connect(manager).addManager(manager.address),
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("when a manager is zero address", async () => {
        await expect(
          managerWhitelist.addManager(ZERO_ADDRESS),
        ).to.be.revertedWith("Mammon__ManagerIsZeroAddress");
      });

      it("when a manager is already present", async () => {
        await managerWhitelist.addManager(manager.address);
        await expect(
          managerWhitelist.addManager(manager.address),
        ).to.be.revertedWith("Mammon__AddressIsAlreadyManager");
      });
    });

    it("should be possible to add a new manager", async () => {
      for (let i = 0; i < users.length; i++) {
        expect(await managerWhitelist.isManager(users[i].address)).to.be.false;

        await managerWhitelist.addManager(users[i].address);

        expect(await managerWhitelist.isManager(users[i].address)).to.be.true;
        expect(await managerWhitelist.getManagers()).to.be.eql(
          users.slice(0, i + 1).map(user => user.address),
        );
      }
    });
  });

  describe("Remove Manager", () => {
    beforeEach(async function () {
      for (let i = 0; i < users.length; i++) {
        await managerWhitelist.addManager(users[i].address);
      }
    });

    describe("should be reverted to remove a manager", () => {
      it("when called from non-owner", async () => {
        await expect(
          managerWhitelist.connect(manager).removeManager(manager.address),
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("when a manager isn't present", async () => {
        await expect(
          managerWhitelist.removeManager(manager.address),
        ).to.be.revertedWith("Mammon__AddressIsNotManager");
      });
    });

    it("should be possible to remove a manager", async () => {
      for (let i = 0; i < users.length; i++) {
        expect(await managerWhitelist.isManager(users[i].address)).to.be.true;

        const managers = await managerWhitelist.getManagers();

        await managerWhitelist.removeManager(users[i].address);

        const managerIndex = managers.findIndex(
          (address: string) => address == users[i].address,
        );
        let newManagers = [...managers];
        newManagers[managerIndex] = managers[managers.length - 1];
        newManagers = newManagers.slice(0, managers.length - 1);

        expect(await managerWhitelist.isManager(users[i].address)).to.be.false;
        expect(await managerWhitelist.getManagers()).to.be.eql(newManagers);
      }
    });
  });

  describe("Add and remove Managers", () => {
    it("should be possible to add and remove managers", async () => {
      for (let i = 0; i < users.length; i++) {
        expect(await managerWhitelist.isManager(users[i].address)).to.be.false;

        await managerWhitelist.addManager(users[i].address);

        expect(await managerWhitelist.isManager(users[i].address)).to.be.true;
        expect(await managerWhitelist.getManagers()).to.be.eql(
          users.slice(0, i + 1).map(user => user.address),
        );
      }

      for (let i = 0; i < users.length; i++) {
        expect(await managerWhitelist.isManager(users[i].address)).to.be.true;

        const managers = await managerWhitelist.getManagers();

        await managerWhitelist.removeManager(users[i].address);

        const managerIndex = managers.findIndex(
          (address: string) => address == users[i].address,
        );
        let newManagers = [...managers];
        newManagers[managerIndex] = managers[managers.length - 1];
        newManagers = newManagers.slice(0, managers.length - 1);

        expect(await managerWhitelist.isManager(users[i].address)).to.be.false;
        expect(await managerWhitelist.getManagers()).to.be.eql(newManagers);
      }
    });
  });
});
