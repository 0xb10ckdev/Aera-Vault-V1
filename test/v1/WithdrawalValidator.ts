import { BigNumber } from "@ethersproject/bignumber";
import { expect } from "chai";
import { artifacts, waffle } from "hardhat";
import { Artifact } from "hardhat/types";
import { PermissiveWithdrawalValidator } from "../../typechain";
import { baseContext } from "../common/contexts";

const { deployContract } = waffle;

baseContext("Withdrawal Validator", function () {
  describe("Permissive Withdrawal Validator", function () {
    beforeEach(async function () {
      const validatorArtifact: Artifact = await artifacts.readArtifact(
        "PermissiveWithdrawalValidator",
      );
      this.permissiveValidator = <PermissiveWithdrawalValidator>(
        await deployContract(this.signers.admin, validatorArtifact, [4])
      );
    });

    it("should return the full withdrawal allowance", async function () {
      const uint256_max: BigNumber = BigNumber.from(2).pow(256).sub(1);
      const tokenAllowances: BigNumber[] =
        await this.permissiveValidator.allowance();
      for (let i = 0; i < tokenAllowances.length; i++) {
        expect(tokenAllowances[i]).to.equal(uint256_max);
      }
    });
  });
});
