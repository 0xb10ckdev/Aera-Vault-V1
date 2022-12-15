import { Signer, Wallet } from "ethers";
import { ethers, waffle } from "hardhat";
import { IERC20 } from "../../typechain";
import { Mocks, Signers } from "./types";

// eslint-disable-next-line func-style
export function baseContext(description: string, testSuite: () => void): void {
  describe(description, function () {
    before(async function () {
      this.signers = {} as Signers;
      this.mocks = {} as Mocks;

      const { admin, guardian, user } = await ethers.getNamedSigners();
      this.signers.admin = admin;
      this.signers.guardian = guardian;
      this.signers.user = user;

      // Fixture loader setup
      this.loadFixture = waffle.createFixtureLoader([
        admin,
        guardian,
        user,
      ] as Signer[] as Wallet[]);

      this.getUserBalances = async (address: string) => {
        return await Promise.all(
          this.tokens.map((token: IERC20) => token.balanceOf(address)),
        );
      };

      this.getGuardiansFeeTotal = async function () {
        return await Promise.all(
          Array.from(Array(this.tokens.length).keys()).map(index =>
            this.vault.guardiansFeeTotal(index),
          ),
        );
      };

      this.getState = async (
        guardianAddress?: string,
        adminAddress?: string,
      ) => {
        const [holdings, adminBalances, guardianBalances] = await Promise.all([
          this.vault.getHoldings(),
          this.getUserBalances(adminAddress || this.signers.admin.address),
          this.getUserBalances(
            guardianAddress || this.signers.guardian.address,
          ),
        ]);

        return {
          holdings,
          adminBalances,
          guardianBalances,
        };
      };
    });

    testSuite();
  });
}
