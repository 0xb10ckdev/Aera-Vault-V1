import { expect } from "chai";
import { DeployPremiaOptionsPricer } from "../../../../tasks/deploy/premia-options-pricer";
import { PremiaOptionsPricer__factory } from "../../../../typechain";

type DeployPremiaOptionsPricerRaw = Omit<DeployPremiaOptionsPricer, "silent">;

export function shouldBehaveLikePremiaOptionsPricerDeployment(): void {
  let validArgs: DeployPremiaOptionsPricerRaw;

  describe("when PremiaOptionsPricer is deployed", function () {
    let factory: PremiaOptionsPricer__factory;

    beforeEach(async function () {
      validArgs = {
        volatilitySurfaceOracle: this.mocks.volatilitySurfaceOracle.address,
        chainlinkOracle: this.mocks.oracle.address,
        baseToken: this.usdc.address,
        underlyingToken: this.weth.address,
      };

      factory = new PremiaOptionsPricer__factory(this.signers.admin);
    });

    async function deployPricer(args: DeployPremiaOptionsPricerRaw) {
      return factory.deploy(
        args.volatilitySurfaceOracle,
        args.chainlinkOracle,
        args.baseToken,
        args.underlyingToken,
      );
    }

    it("deploys", async () => {
      await expect(deployPricer(validArgs)).not.to.be.reverted;
    });

    describe("when VolatilitySurfaceOracle is not contract", function () {
      it("reverts", async function () {
        await expect(
          deployPricer({
            ...validArgs,
            volatilitySurfaceOracle: this.signers.admin.address,
          }),
        ).to.be.revertedWith("Aera__VolatilitySurfaceOracleIsNotContract()");
      });
    });

    describe("when ChainlinkOracle is not contract", function () {
      it("reverts", async function () {
        await expect(
          deployPricer({
            ...validArgs,
            chainlinkOracle: this.signers.admin.address,
          }),
        ).to.be.revertedWith("Aera__ChainlinkOracleIsNotContract()");
      });
    });

    describe("when baseToken", function () {
      describe("when is not contract", function () {
        it("reverts", async function () {
          await expect(
            deployPricer({
              ...validArgs,
              baseToken: this.signers.admin.address,
            }),
          ).to.be.revertedWith("Aera__BaseTokenIsNotContract()");
        });
      });
    });

    describe("when underlyingToken", function () {
      describe("when is not contract", function () {
        it("reverts", async function () {
          await expect(
            deployPricer({
              ...validArgs,
              underlyingToken: this.signers.admin.address,
            }),
          ).to.be.revertedWith("Aera__UnderlyingTokenIsNotContract()");
        });
      });
    });
  });
}
