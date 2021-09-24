import { ethers, deployments } from "hardhat";

import { IERC20, IERC20__factory, MammonVaultV0 } from "../typechain";
import { deployVault } from "./utils";
import { expect } from "chai";
import { Signer } from "ethers";

const ONE_TOKEN = ethers.utils.parseEther("1");
const MIN_WEIGHT = ethers.utils.parseEther("1");

describe("Mammon Vault v0", function () {
  let admin: Signer;
  let manager: Signer;
  let vault: MammonVaultV0;
  let dai: IERC20;
  let weth: IERC20;
  before(async function () {
    admin = await ethers.getNamedSigner("admin");
    manager = await ethers.getNamedSigner("manager");
    await deployments.fixture();
  });

  beforeEach(async function () {
    dai = IERC20__factory.connect(
      (await deployments.get("DAI")).address,
      admin,
    );
    weth = IERC20__factory.connect(
      (await deployments.get("WETH")).address,
      admin,
    );

    vault = await deployVault(
      admin,
      dai.address,
      weth.address,
      await manager.getAddress(),
    );
  });

  describe("Vault initialization", () => {
    it("should be possible to initialize the vault", async () => {
      await dai.approve(vault.address, ONE_TOKEN);
      await weth.approve(vault.address, ONE_TOKEN);

      await vault.initialDeposit(ONE_TOKEN, ONE_TOKEN, MIN_WEIGHT, MIN_WEIGHT);

      expect(await vault.holdings0()).to.equal(ONE_TOKEN);
      expect(await vault.holdings1()).to.equal(ONE_TOKEN);
    });
  });
});
