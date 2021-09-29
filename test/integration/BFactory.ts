import hre from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import {
  IBFactory,
  IBFactory__factory,
  IERC20,
  IERC20__factory,
} from "../../typechain";

let admin: SignerWithAddress;
let user1: SignerWithAddress;
let bFactory: IBFactory;
let weth: IERC20, dai: IERC20;
let NON_ADMIN: string;
const uint256_max: BigNumber = BigNumber.from(2).pow(256).sub(1);

describe("Factory", function () {
  before(async function () {
    const signers: SignerWithAddress[] = await hre.ethers.getSigners();
    admin = signers[0];
    user1 = signers[1];
    NON_ADMIN = await user1.getAddress();

    bFactory = IBFactory__factory.connect(
      <string>process.env.BFACTORY,
      admin,
    );

    weth = IERC20__factory.connect(<string>process.env.WETH, admin);
    dai = IERC20__factory.connect(<string>process.env.DAI, admin);
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

    await weth.connect(admin).approve(POOL, uint256_max);
    await dai.connect(admin).approve(POOL, uint256_max);

    await weth.connect(user1).approve(POOL, uint256_max);
    await dai.connect(user1).approve(POOL, uint256_max);
  });
});
