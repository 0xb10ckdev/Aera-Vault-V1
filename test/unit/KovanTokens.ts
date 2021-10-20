import { ethers, waffle, artifacts } from "hardhat";
import { Artifact } from "hardhat/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import { ONE_TOKEN } from "../constants";
import {
  ApplesKovan,
  OrangesKovan,
  ERC20PresetMinterPauser,
} from "../../typechain";

const { deployContract } = waffle;

describe("Kovan tokens", function () {
  // contracts
  let applesKovan: ApplesKovan;
  let orangesKovan: OrangesKovan;

  // accounts
  let admin: SignerWithAddress;
  let other: SignerWithAddress;

  beforeEach(async function () {
    [admin, other] = await ethers.getSigners();

    const applesKovanArtifact: Artifact = await artifacts.readArtifact(
      "ApplesKovan",
    );
    applesKovan = <ApplesKovan>(
      await deployContract(admin, applesKovanArtifact)
    );

    const orangesKovanArtifact: Artifact = await artifacts.readArtifact(
      "OrangesKovan",
    );
    orangesKovan = <OrangesKovan>(
      await deployContract(admin, orangesKovanArtifact)
    );
  });

  describe("when both tokens are deployed", () => {
    // this function needs to bind token at the last possible moment
    const testToken = async (token: ERC20PresetMinterPauser) => {
      await token.mint(admin.address, ONE_TOKEN);
      expect(await token.totalSupply()).to.equal(ONE_TOKEN);

      await token.transfer(other.address, ONE_TOKEN);
      expect(await token.balanceOf(other.address)).to.equal(ONE_TOKEN);
    };

    it("should allow admin to mint and transfer APPLZ", async () =>
      await testToken(applesKovan));

    it("should allow admin to mint and transfer ORNGZ", async () =>
      await testToken(orangesKovan));
  });
});
