import { Signer, Wallet } from "ethers";
import { ethers, waffle } from "hardhat";
import { IERC20 } from "../../typechain";
import { Signers } from "./types";

// eslint-disable-next-line func-style
export function baseContext(description: string, testSuite: () => void): void {
  describe(description, function () {
    before(async function () {
      this.signers = {} as Signers;

      const { admin, manager, user } = await ethers.getNamedSigners();
      this.signers.admin = admin;
      this.signers.manager = manager;
      this.signers.user = user;

      // Fixture loader setup
      this.loadFixture = waffle.createFixtureLoader([
        admin,
        manager,
        user,
      ] as Signer[] as Wallet[]);

      this.getUserBalances = async (address: string) => {
        return await Promise.all(
          this.tokens.map((token: IERC20) => token.balanceOf(address)),
        );
      };

      this.getManagersFeeTotal = async function () {
        return await Promise.all(
          Array.from(Array(this.tokens.length).keys()).map(index =>
            this.vault.managersFeeTotal(index),
          ),
        );
      };

      this.getState = async (
        managerAddress?: string,
        adminAddress?: string,
      ) => {
        const [holdings, adminBalances, managerBalances] = await Promise.all([
          this.vault.getHoldings(),
          this.getUserBalances(adminAddress || this.signers.admin.address),
          this.getUserBalances(managerAddress || this.signers.manager.address),
        ]);

        return {
          holdings,
          adminBalances,
          managerBalances,
        };
      };
    });

    testSuite();
  });
}
