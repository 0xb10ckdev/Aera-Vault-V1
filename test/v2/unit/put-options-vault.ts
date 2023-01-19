import hre, { ethers } from "hardhat";
import { DeployPutOptionsVault } from "../../../tasks/deploy/put-options-vault";
import {
  ERC20Mock__factory,
  MockAddressBook__factory,
  MockGammaOracle__factory,
  MockOTokenController__factory,
  MockWhitelist__factory,
  PutOptionsPricerMock__factory,
  PutOptionsVault__factory,
} from "../../../typechain";
import { baseContext } from "../../shared/contexts";
import { shouldBehaveLikePutOptionsVault } from "../functions/put-options-vault";
import {
  EXPIRY_DELTA_MAX,
  EXPIRY_DELTA_MIN,
  STRIKE_MULTIPLIER_MAX,
  STRIKE_MULTIPLIER_MIN,
  USDC_DECIMALS,
} from "../functions/put-options-vault/constants";
import {
  createAndFillBuyOrder,
  createBuyOrder,
  createOToken,
  fillBuyOrder,
} from "../functions/put-options-vault/options-utils";
import { toUnit, toWei } from "../utils";

baseContext("Put Options Vault: Unit Tests", function () {
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
      USDC_DECIMALS,
      toUnit(1_000_000, USDC_DECIMALS),
    );

    const pricer = await new PutOptionsPricerMock__factory(admin).deploy();
    const whitelist = await new MockWhitelist__factory(admin).deploy();
    const addressBook = await new MockAddressBook__factory(admin).deploy();
    await addressBook.setWhitelist(whitelist.address);

    const vaultAddress = await hre.run("deploy:put-options-vault", {
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
      minChunkValue: toUnit(1, USDC_DECIMALS).toString(),
      maxOrderActive: 60 * 60 * 24 * 3, // 3 days
      name: "USDC Option",
      symbol: "oUSDC",
      opynAddressBook: addressBook.address,
      silent: true,
    } as DeployPutOptionsVault);

    const vault = PutOptionsVault__factory.connect(vaultAddress, admin);

    const oracle = await new MockGammaOracle__factory(admin).deploy();

    const controller = await new MockOTokenController__factory(admin).deploy(
      oracle.address,
    );

    return {
      pricer,
      weth,
      usdc,
      vault,
      controller,
      oracle,
      addressBook,
      whitelist,
    };
  }

  beforeEach(async function () {
    const {
      pricer,
      weth,
      usdc,
      vault,
      controller,
      oracle,
      addressBook,
      whitelist,
    } = await this.loadFixture(putOptionsVaultFixture);

    this.createOToken = createOToken.bind(this);
    this.createAndFillBuyOrder = createAndFillBuyOrder.bind(this);
    this.createBuyOrder = createBuyOrder.bind(this);
    this.fillBuyOrder = fillBuyOrder.bind(this);

    this.mocks.pricer = pricer;
    this.mocks.gammaOracle = oracle;
    this.mocks.oTokenController = controller;
    this.mocks.addressBook = addressBook;
    this.mocks.whitelist = whitelist;

    this.weth = weth;
    this.usdc = usdc;
    this.putOptionsVault = vault;
  });

  shouldBehaveLikePutOptionsVault();
});
