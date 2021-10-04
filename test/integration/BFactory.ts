import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { ethers } from "hardhat";
import {
  IBFactory,
  IBFactory__factory,
  IERC20,
  IERC20__factory,
} from "../../typechain";

let admin: SignerWithAddress;
let user: SignerWithAddress;
let bFactory: IBFactory;
let weth: IERC20, dai: IERC20;
const UINT256_MAX: BigNumber = BigNumber.from(2).pow(256).sub(1);

describe("Factory", function () {
  before(async function () {
    ({ admin, user } = await ethers.getNamedSigners());
    bFactory = IBFactory__factory.connect(
      "0x9424B1412450D0f8Fc2255FAf6046b98213B76Bd", // BFactory on mainnet
      admin,
    );

    weth = IERC20__factory.connect(
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH on mainnet
      admin,
    );
    dai = IERC20__factory.connect(
      "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI on mainnet
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

    await weth.connect(admin).approve(POOL, UINT256_MAX);
    await dai.connect(admin).approve(POOL, UINT256_MAX);

    await weth.connect(user).approve(POOL, UINT256_MAX);
    await dai.connect(user).approve(POOL, UINT256_MAX);
  });
});
