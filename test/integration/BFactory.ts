import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { ethers } from "hardhat";
import { setupTokens } from "../fixtures";
import { getConfig, getChainId } from "../../scripts/config";
import { IBFactory, IBFactory__factory, IERC20 } from "../../typechain";

let admin: SignerWithAddress;
let user: SignerWithAddress;
let bFactory: IBFactory;
let WETH: IERC20, DAI: IERC20;
const UINT256_MAX: BigNumber = BigNumber.from(2).pow(256).sub(1);

describe("Factory", function () {
  before(async function () {
    const chainId = getChainId(process.env.HARDHAT_FORK);
    const config = getConfig(chainId);

    ({ admin, user } = await ethers.getNamedSigners());
    bFactory = IBFactory__factory.connect(
      config.bFactory, // BFactory on mainnet
      admin,
    );

    ({ DAI, WETH } = await setupTokens());
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
