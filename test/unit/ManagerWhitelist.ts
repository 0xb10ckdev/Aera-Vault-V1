import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { ManagerWhitelist__factory, ManagerWhitelist } from "../../typechain";
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
  let admin: SignerWithAddress;
  let manager: SignerWithAddress;
  let users: SignerWithAddress[];
  let contract: ManagerWhitelist;
  let snapshot: unknown;

  beforeEach(async function () {
    snapshot = await ethers.provider.send("evm_snapshot", []);

    const signers = await ethers.getSigners();
    admin = signers[0];
    manager = signers[1];
    users = signers.slice(2);

    const contractFactory =
      await ethers.getContractFactory<ManagerWhitelist__factory>(
        "ManagerWhitelist",
      );
    contract = await contractFactory.connect(admin).deploy([]);
  });

  afterEach(async () => {
    await ethers.provider.send("evm_revert", [snapshot]);
  });

  describe("Add Manager", () => {
    describe("should be reverted to add a new manager", () => {
      it("when called from non-owner", async () => {
        await expect(
          contract.connect(manager).addManager(manager.address),
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("when a manager is zero address", async () => {
        await expect(contract.addManager(ZERO_ADDRESS)).to.be.revertedWith(
          "Mammon__ManagerIsZeroAddress",
        );
      });

      it("when a manager is already present", async () => {
        await contract.addManager(manager.address);
        await expect(contract.addManager(manager.address)).to.be.revertedWith(
          "Mammon__AddressIsAlreadyManager",
        );
      });
    });

    it("should be possible to add a new manager", async () => {
      for (let i = 0; i < users.length; i++) {
        expect(await contract.isManager(users[i].address)).to.be.false;

        await contract.addManager(users[i].address);

        expect(await contract.isManager(users[i].address)).to.be.true;
        expect(await contract.getManagers()).to.be.eql(
          users.slice(0, i + 1).map(user => user.address),
        );
      }
    });
  });

  describe("Remove Manager", () => {
    beforeEach(async function () {
      for (let i = 0; i < users.length; i++) {
        await contract.addManager(users[i].address);
      }
    });

    describe("should be reverted to remove a manager", () => {
      it("when called from non-owner", async () => {
        await expect(
          contract.connect(manager).removeManager(manager.address),
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("when a manager isn't present", async () => {
        await expect(
          contract.removeManager(manager.address),
        ).to.be.revertedWith("Mammon__AddressIsNotManager");
      });
    });

    it("should be possible to remove a manager", async () => {
      for (let i = 0; i < users.length; i++) {
        expect(await contract.isManager(users[i].address)).to.be.true;

        const managers = await contract.getManagers();

        await contract.removeManager(users[i].address);

        const managerIndex = managers.findIndex(
          (address: string) => address == users[i].address,
        );
        let newManagers = [...managers];
        newManagers[managerIndex] = managers[managers.length - 1];
        newManagers = newManagers.slice(0, managers.length - 1);

        expect(await contract.isManager(users[i].address)).to.be.false;
        expect(await contract.getManagers()).to.be.eql(newManagers);
      }
    });
  });
});
