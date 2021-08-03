import hre from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { Artifact } from "hardhat/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { PermissiveWithdrawalValidator } from "../typechain/PermissiveWithdrawalValidator";
import { Signers } from "../types";
import { expect } from "chai";

const { deployContract } = hre.waffle;

describe("Withdrawal Validator", function () {
  before(async function () {
    this.signers = {} as Signers;

    const signers: SignerWithAddress[] = await hre.ethers.getSigners();
    this.signers.admin = signers[0];
  });

  describe("Permissive Withdrawal Validator", function () {
    beforeEach(async function () {
      const validatorArtifact: Artifact = await hre.artifacts.readArtifact("PermissiveWithdrawalValidator");
      this.validator = <PermissiveWithdrawalValidator>await deployContract(this.signers.admin, validatorArtifact);
    });

    it("should return the full withdrawal allowance", async function () {
      const uint256_max: BigNumber = BigNumber.from(2).pow(256).sub(1);
      const tokenAllowance: [BigNumber, BigNumber] = await this.validator.allowance();
      expect(tokenAllowance[0]).to.equal(uint256_max);
      expect(tokenAllowance[1]).to.equal(uint256_max);
    });
  });
});
