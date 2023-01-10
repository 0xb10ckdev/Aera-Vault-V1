import { expect } from "chai";
import { DeployPutOptionsVault } from "../../../../tasks/deploy/put-options-vault";
import { PutOptionsVault__factory } from "../../../../typechain";
import {
  EXPIRY_DELTA_MAX,
  EXPIRY_DELTA_MIN,
  STRIKE_MULTIPLIER_MAX,
  STRIKE_MULTIPLIER_MIN,
} from "../../functions/put-options-vault/constants";
import { toWei } from "../../utils";

type DeployPutOptionsVaultRaw = Omit<DeployPutOptionsVault, "silent">;

export function shouldBehaveLikePutOptionsVaultDeployment(): void {
  let validArgs: DeployPutOptionsVaultRaw;

  describe("when PutOptionVault is deployed", function () {
    let factory: PutOptionsVault__factory;

    beforeEach(async function () {
      validArgs = {
        controller: this.signers.admin.address,
        liquidator: this.signers.admin.address,
        broker: this.signers.admin.address,
        pricer: this.mocks.pricer.address,
        underlyingAsset: this.usdc.address,
        underlyingOptionsAsset: this.weth.address,
        expiryDeltaMin: EXPIRY_DELTA_MIN,
        expiryDeltaMax: EXPIRY_DELTA_MAX,
        strikeMultiplierMin: toWei(STRIKE_MULTIPLIER_MIN),
        strikeMultiplierMax: toWei(STRIKE_MULTIPLIER_MAX),
        name: "USDC Put Option Vault",
        symbol: "oUSDCpVault",
        opynAddressBook: this.opynAddressBook.address,
      };

      factory = new PutOptionsVault__factory(this.signers.admin);
    });

    function deployVault(args: DeployPutOptionsVaultRaw) {
      return factory.deploy(
        args.controller,
        args.liquidator,
        args.broker,
        args.pricer,
        args.underlyingAsset,
        args.underlyingOptionsAsset,
        { min: args.expiryDeltaMin, max: args.expiryDeltaMax },
        { min: args.strikeMultiplierMin, max: args.strikeMultiplierMax },
        args.name,
        args.symbol,
        args.opynAddressBook,
      );
    }

    it("deploys", async () => {
      await expect(deployVault(validArgs)).not.to.be.reverted;
    });
  });
}
