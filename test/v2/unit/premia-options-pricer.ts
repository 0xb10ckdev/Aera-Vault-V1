import { ethers } from "hardhat";
import {
  ERC20Mock__factory,
  MockVolatilitySurfaceOracle__factory,
  OracleMock__factory,
  PremiaOptionsPricer__factory,
} from "../../../typechain";
import { baseContext } from "../../shared/contexts";
import { shouldBehaveLikePremiaOptionsPricer } from "../functions/premia-options-pricer";
import { USDC_DECIMALS } from "../functions/put-options-vault/constants";
import { toUnit, toWei } from "../utils";

baseContext("Premia Options Pricer: Unit Tests", function () {
  async function premiaOptionsPricerFixture() {
    const admin = await ethers.getNamedSigner("admin");

    const volatilitySurfaceOracle =
      await new MockVolatilitySurfaceOracle__factory(admin).deploy();
    const chainlinkOracle = await new OracleMock__factory(admin).deploy(18);
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

    const pricer = await new PremiaOptionsPricer__factory(admin).deploy(
      volatilitySurfaceOracle.address,
      chainlinkOracle.address,
      usdc.address,
      weth.address,
    );

    return {
      pricer,
      volatilitySurfaceOracle,
      chainlinkOracle,
      weth,
      usdc,
    };
  }

  beforeEach(async function () {
    const { pricer, volatilitySurfaceOracle, chainlinkOracle, weth, usdc } =
      await this.loadFixture(premiaOptionsPricerFixture);
    this.pricer = pricer;
    this.weth = weth;
    this.usdc = usdc;
    this.mocks.oracle = chainlinkOracle;
    this.mocks.volatilitySurfaceOracle = volatilitySurfaceOracle;
  });

  shouldBehaveLikePremiaOptionsPricer();
});
