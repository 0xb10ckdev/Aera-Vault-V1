import hre, { ethers } from "hardhat";
import { DeployPutOptionsVault } from "../../../../tasks/deploy/put-options-vault";
import {
  AddressBookInterface__factory,
  IERC20__factory,
  PutOptionsPricerMock__factory,
  PutOptionsVault__factory,
} from "../../../../typechain";
import {
  EXPIRY_DELTA_MAX,
  EXPIRY_DELTA_MIN,
  STRIKE_MULTIPLIER_MAX,
  STRIKE_MULTIPLIER_MIN,
  USDC_DECIMALS,
} from "../../functions/put-options-vault/constants";
import {
  createAndFillBuyOrder,
  createBuyOrder,
  createOToken,
  fillBuyOrder,
} from "../../functions/put-options-vault/options-utils";
import { impersonate, toUnit, toWei } from "../../utils";
import { shouldBehaveLikePutOptionsVaultDeployment } from "./deployment";
import { shouldBehaveLikePutOptionsCreateFillRedeemBuyOrder } from "./create-fill-redeem-buy-order";

export function integrationTestPutOptionsVault(): void {
  const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  // taken from https://opyn.gitbook.io/opyn/getting-started/abis-smart-contract-addresses#ethereum-mainnet
  const OPYN_ADDRESS_BOOK_ADDRESS =
    "0x1E31F2DCBad4dc572004Eae6355fB18F9615cBe4";

  async function putOptionsVaultFixture() {
    const admin = await ethers.getNamedSigner("admin");
    const pricer = await new PutOptionsPricerMock__factory(admin).deploy();

    const vaultAddress = await hre.run("deploy:put-options-vault", {
      controller: admin.address,
      liquidator: admin.address,
      broker: admin.address,
      pricer: pricer.address,
      underlyingAsset: USDC_ADDRESS,
      underlyingOptionsAsset: WETH_ADDRESS,
      expiryDeltaMin: EXPIRY_DELTA_MIN,
      expiryDeltaMax: EXPIRY_DELTA_MAX,
      strikeMultiplierMin: STRIKE_MULTIPLIER_MIN,
      strikeMultiplierMax: STRIKE_MULTIPLIER_MAX,
      minChunkValue: toUnit(1, USDC_DECIMALS).toString(),
      minOrderActive: 60 * 60 * 24 * 3, // 3 days
      name: "USDC Option",
      symbol: "oUSDC",
      opynAddressBook: OPYN_ADDRESS_BOOK_ADDRESS,
      silent: true,
    } as DeployPutOptionsVault);

    const vault = PutOptionsVault__factory.connect(vaultAddress, admin);
    const weth = IERC20__factory.connect(WETH_ADDRESS, admin);
    const usdc = IERC20__factory.connect(USDC_ADDRESS, admin);
    const addressBook = AddressBookInterface__factory.connect(
      OPYN_ADDRESS_BOOK_ADDRESS,
      admin,
    );

    await admin.sendTransaction({
      to: "0x2fEb1512183545f48f6b9C5b4EbfCaF49CfCa6F3",
      value: toWei(1),
    });

    await admin.sendTransaction({
      to: "0xf977814e90da44bfa03b6295a0616a897441acec",
      value: toWei(1),
    });

    await weth
      .connect(await impersonate("0x2fEb1512183545f48f6b9C5b4EbfCaF49CfCa6F3"))
      .transfer(admin.address, toWei(1000));
    await usdc
      .connect(await impersonate("0xf977814e90da44bfa03b6295a0616a897441acec"))
      .transfer(admin.address, toUnit(1000000, USDC_DECIMALS));

    return {
      vault,
      weth,
      usdc,
      addressBook,
      pricer,
    };
  }

  beforeEach(async function () {
    const { pricer, vault, weth, usdc, addressBook } = await this.loadFixture(
      putOptionsVaultFixture,
    );

    this.createOToken = createOToken.bind(this);
    this.createAndFillBuyOrder = createAndFillBuyOrder.bind(this);
    this.createBuyOrder = createBuyOrder.bind(this);
    this.fillBuyOrder = fillBuyOrder.bind(this);

    this.mocks.pricer = pricer;

    this.weth = weth;
    this.usdc = usdc;
    this.putOptionsVault = vault;
    this.opynAddressBook = addressBook;
  });

  describe("Put Options Vault", function () {
    describe("Deployment", function () {
      shouldBehaveLikePutOptionsVaultDeployment();
    });

    describe("Scenarios", function () {
      shouldBehaveLikePutOptionsCreateFillRedeemBuyOrder();
    });
  });
}
