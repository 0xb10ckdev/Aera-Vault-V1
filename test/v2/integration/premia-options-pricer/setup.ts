import hre, { ethers } from "hardhat";
import { DeployPremiaOptionsPricer } from "../../../../tasks/deploy/premia-options-pricer";
import { IERC20__factory } from "../../../../typechain";
import { AggregatorV2V3Interface__factory } from "../../../../typechain/factories/AggregatorV2V3Interface__factory";
import { IVolatilitySurfaceOracle__factory } from "../../../../typechain/factories/IVolatilitySurfaceOracle__factory";
import { PremiaOptionsPricer__factory } from "../../../../typechain/factories/PremiaOptionsPricer__factory";
import { reset } from "../../utils";
import { shouldBehaveLikePremiaOptionsPricerGetPremium } from "./get-premium";
import { shouldBehaveLikePremiaOptionsPricerGetSpot } from "./get-spot";

export function integrationTestPremiaOptionsPricer(): void {
  const VOLATILITY_SURFACE_ORACLE_ADDRESS =
    "0x3a87bb29b984d672664aa1dd2d19d2e8b24f0f2a";
  const CHAINLINK_USD_ETH_ADDRESS =
    "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
  const BASE_TOKEN_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F"; // DAI
  const UNDERLYING_TOKEN_ADDRESS =
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // WETH
  const FORK_BLOCK = 16_400_000;

  async function premiaOptionsPricerFixture() {
    await reset(hre.config.networks.hardhat.forking?.url, FORK_BLOCK);

    const admin = await ethers.getNamedSigner("admin");

    const volatilitySurfaceOracle = IVolatilitySurfaceOracle__factory.connect(
      VOLATILITY_SURFACE_ORACLE_ADDRESS,
      admin,
    );
    const chainlinkOracle = AggregatorV2V3Interface__factory.connect(
      CHAINLINK_USD_ETH_ADDRESS,
      admin,
    );
    const baseToken = IERC20__factory.connect(BASE_TOKEN_ADDRESS, admin);
    const underlyingToken = IERC20__factory.connect(
      UNDERLYING_TOKEN_ADDRESS,
      admin,
    );

    const pricerAddress = await hre.run("deploy:premia-options-pricer", {
      volatilitySurfaceOracle: volatilitySurfaceOracle.address,
      chainlinkOracle: chainlinkOracle.address,
      baseToken: baseToken.address,
      underlyingToken: underlyingToken.address,
      silent: true,
    } as DeployPremiaOptionsPricer);

    const pricer = PremiaOptionsPricer__factory.connect(pricerAddress, admin);

    return {
      volatilitySurfaceOracle,
      chainlinkOracle,
      pricer,
    };
  }

  beforeEach(async function () {
    const { volatilitySurfaceOracle, chainlinkOracle, pricer } =
      await this.loadFixture(premiaOptionsPricerFixture);

    this.premiaPricer = pricer;
    this.volatilitySurfaceOracle = volatilitySurfaceOracle;
    this.chainlinkOracle = chainlinkOracle;
  });

  describe("Premia Options Pricer", function () {
    describe("getSpot", function () {
      shouldBehaveLikePremiaOptionsPricerGetSpot();
    });

    describe("getPremium", function () {
      shouldBehaveLikePremiaOptionsPricerGetPremium();
    });
  });
}
