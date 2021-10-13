import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { ethers } from "hardhat";
import { IBFactory, IBFactory__factory, IERC20 } from "../../typechain";
import { setupTokens } from "../fixtures";
import { getConfig } from "../../scripts/config";

let admin: SignerWithAddress;
let user: SignerWithAddress;
let bFactory: IBFactory;
let DAI: IERC20;
let WETH: IERC20;
const UINT256_MAX: BigNumber = BigNumber.from(2).pow(256).sub(1);

describe("Factory", function () {
  before(async function () {
    ({ admin, user } = await ethers.getNamedSigners());

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const config = getConfig(chainId);

    ({ DAI, WETH } = await setupTokens());

    bFactory = IBFactory__factory.connect(
      config.bFactory, // BFactory on mainnet
      admin,
    );
  });

  it("should deploy balancer private pool", async function () {
    const pool = await bFactory.connect(admin).newBPool(); // this works fine in clean room
    const receipt = await pool.wait();
    const LOG_NEW_POOL = receipt.events?.find(
      event =>
        event.topics[0] ==
        "0x8ccec77b0cb63ac2cafd0f5de8cdfadab91ce656d262240ba8a6343bccc5f945",
    );
    const POOL = `0x${LOG_NEW_POOL?.topics[2].slice(26)}`;

    await WETH.connect(admin).approve(POOL, UINT256_MAX);
    await DAI.connect(admin).approve(POOL, UINT256_MAX);

    await WETH.connect(user).approve(POOL, UINT256_MAX);
    await DAI.connect(user).approve(POOL, UINT256_MAX);
  });
});
