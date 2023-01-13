import hre, { ethers } from "hardhat";
import { DeployPremiaOptionsPricer } from "../../../tasks/deploy/premia-options-pricer";
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

    const pricerAddress = await hre.run("deploy:premia-options-pricer", {
      volatilitySurfaceOracle: volatilitySurfaceOracle.address,
      chainlinkOracle: chainlinkOracle.address,
      baseToken: usdc.address,
      underlyingToken: weth.address,
      silent: true,
    } as DeployPremiaOptionsPricer);

    const pricer = PremiaOptionsPricer__factory.connect(pricerAddress, admin);

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
