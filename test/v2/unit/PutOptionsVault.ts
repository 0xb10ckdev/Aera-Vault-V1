import hre, { ethers } from "hardhat";
import {
  PutOptionsPricerMock__factory,
  PutOptionsVault,
} from "../../../typechain";
import { baseContext } from "../../shared/contexts";
import { shouldBehaveLikePutOptionsVault } from "../functions/put-options-vault";
import {
  EXPIRY_DELTA_MAX,
  EXPIRY_DELTA_MIN,
  STRIKE_MULTIPLIER_MAX,
  STRIKE_MULTIPLIER_MIN,
} from "../functions/put-options-vault/constants";
import { toUnit, toWei } from "../utils";
import { ERC20Mock__factory } from "./../../../typechain/factories/ERC20Mock__factory";

baseContext("Put Options Vault: Unit Tests", function () {
  unitTestPutOptionsVault();
});

function unitTestPutOptionsVault() {
  describe.only("PutOptionsVault Setup", function () {
    async function putOptionsVaultFixture() {
      const admin = await ethers.getNamedSigner("admin");

      const weth = await new ERC20Mock__factory(admin).deploy(
        "WETH Test Token",
        "WETH",
        18,
        toWei(1_000_000),
      );
      const usdc = await new ERC20Mock__factory(admin).deploy(
        "USDC Test Token",
        "USDC",
        6,
        toUnit(1_000_000, 6),
      );

      const pricer = await new PutOptionsPricerMock__factory(admin).deploy();

      const vault = (await hre.run("deploy:put-options-vault", {
        controller: admin.address,
        liquidator: admin.address,
        broker: admin.address,
        pricer: pricer.address,
        underlyingAsset: usdc.address,
        underlyingOptionsAsset: weth.address,
        expiryDeltaMin: EXPIRY_DELTA_MIN,
        expiryDeltaMax: EXPIRY_DELTA_MAX,
        strikeMultiplierMin: STRIKE_MULTIPLIER_MIN,
        strikeMultiplierMax: STRIKE_MULTIPLIER_MAX,
        name: "USDC Option",
        symbol: "oUSDC",
        silent: true,
      })) as PutOptionsVault;

      return { pricer, weth, usdc, vault };
    }

    beforeEach(async function () {
      const { pricer, weth, usdc, vault } = await this.loadFixture(
        putOptionsVaultFixture,
      );

      this.mocks.pricer = pricer;
      this.weth = weth;
      this.usdc = usdc;
      this.putOptionsVault = vault;
    });

    shouldBehaveLikePutOptionsVault();
  });
}
