import { ethers, deployments } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { deployVault, toWei } from "../utils";
import {
  IERC20,
  IERC20__factory,
  MammonVaultV0,
  IBPoolMock,
  IBPoolMock__factory
} from "../../typechain";

const ONE_TOKEN = toWei("1");
const MIN_WEIGHT = toWei("1");
const MAX_IN_RATIO = toWei(1 / 2);
const MAX_OUT_RATIO = toWei(1 / 3).add(1);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

describe("Swap on Balancer Pool", function () {
  let signers: SignerWithAddress[];
  let admin: Signer;
  let manager: Signer;
  let user1: Signer;
  let bPool: IBPoolMock;
  let vault: MammonVaultV0;
  let dai: IERC20;
  let weth: IERC20;

  let ADMIN, MANAGER, USER1;
  let DAI, WETH;
  let VAULT, BPOOL;

  before(async function () {
    signers = await ethers.getSigners();
    admin = await ethers.getNamedSigner("admin");
    manager = await ethers.getNamedSigner("manager");
    user1 = signers[2];
    ADMIN = await admin.getAddress();
    MANAGER = await manager.getAddress();
    USER1 = await user1.getAddress();

    await deployments.fixture();
  });

  before(async function () {
    dai = IERC20__factory.connect(
      (await deployments.get("DAI")).address,
      admin,
    );
    weth = IERC20__factory.connect(
      (await deployments.get("WETH")).address,
      admin,
    );

    DAI = dai.address;
    WETH = weth.address;

    vault = await deployVault(
      admin,
      DAI,
      WETH,
      MANAGER,
    );

    VAULT = vault.address;
    BPOOL = await vault.pool();

    bPool = IBPoolMock__factory.connect(BPOOL, admin.provider!);

    await dai.approve(VAULT, ONE_TOKEN);
    await weth.approve(VAULT, ONE_TOKEN);

    await vault.initialDeposit(ONE_TOKEN, ONE_TOKEN, MIN_WEIGHT, MIN_WEIGHT);

    await dai.approve(VAULT, toWei(50));
    await weth.approve(VAULT, toWei(20));

    await vault.deposit(toWei(10), toWei(20));
  });
  
  describe("swapExactAmountIn", () => {
    it("should be reverted to call swapExactAmountIn", async () => {
      let holdings0 = await vault.holdings0();
      let spotPrice = await bPool.getSpotPrice(DAI, WETH);

      await expect(
        bPool.connect(user1).swapExactAmountIn(
          ZERO_ADDRESS, toWei(3), WETH, toWei(5), spotPrice
        )
      ).to.be.revertedWith("ERR_NOT_BOUND");

      await expect(
        bPool.connect(user1).swapExactAmountIn(
          DAI, toWei(3), WETH, toWei(5), spotPrice
        )
      ).to.be.revertedWith("ERR_SWAP_NOT_PUBLIC");

      await vault.connect(manager).setPublicSwap(true);

      await expect(
        bPool.connect(user1).swapExactAmountIn(
          DAI, holdings0.mul(MAX_IN_RATIO).add(1), WETH, toWei(5), spotPrice
        )
      ).to.be.revertedWith("ERR_MAX_IN_RATIO");

      await expect(
        bPool.connect(user1).swapExactAmountIn(
          DAI, toWei(3), WETH, toWei(5), spotPrice.sub(1)
        )
      ).to.be.revertedWith("ERR_BAD_LIMIT_PRICE");

      await expect(
        bPool.connect(user1).swapExactAmountIn(
          DAI, toWei(3), WETH, toWei(5), spotPrice.add(toWei(1))
        )
      ).to.be.revertedWith("ERR_LIMIT_OUT");

      await expect(
        bPool.connect(user1).swapExactAmountIn(
          DAI, toWei(3), WETH, toWei(1), spotPrice
        )
      ).to.be.revertedWith("ERR_LIMIT_PRICE");

      await expect(
        bPool.connect(user1).swapExactAmountIn(
          DAI, toWei(3), WETH, toWei(1), spotPrice.add(toWei(1))
        )
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("should be possible to sell given number of token0", async () => {
      let spotPrice = await bPool.getSpotPrice(DAI, WETH);
      await dai.connect(admin).transfer(USER1, toWei(3));

      await expect(
        bPool.connect(user1).swapExactAmountIn(
          DAI, toWei(3), WETH, toWei(1), spotPrice.add(toWei(1))
        )
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");

      let holdings0 = await vault.holdings0();
      let holdings1 = await vault.holdings1();
      let weight0 = await vault.getDenormalizedWeight(DAI);
      let weight1 = await vault.getDenormalizedWeight(WETH);
      let swapFee = await vault.getSwapFee();
      let balance1 = await weth.balanceOf(USER1);

      let tokenAmountOut = await bPool.calcOutGivenIn(
        holdings0, weight0, holdings1, weight1, toWei(3), swapFee
      );

      await dai.connect(user1).approve(BPOOL, toWei(3));
      await bPool.connect(user1).swapExactAmountIn(
        DAI, toWei(3), WETH, toWei(1), spotPrice.add(toWei(1))
      );

      expect(await weth.balanceOf(USER1)).to.equal(balance1.add(tokenAmountOut));
    });

    it("should be possible to sell given number of token1", async () => {
      let spotPrice = await bPool.getSpotPrice(WETH, DAI);
      await weth.connect(admin).transfer(USER1, toWei(3));

      await expect(
        bPool.connect(user1).swapExactAmountIn(
          WETH, toWei(3), DAI, toWei(1), spotPrice.add(toWei(1))
        )
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");

      let holdings0 = await vault.holdings0();
      let holdings1 = await vault.holdings1();
      let weight0 = await vault.getDenormalizedWeight(DAI);
      let weight1 = await vault.getDenormalizedWeight(WETH);
      let swapFee = await vault.getSwapFee();
      let balance0 = await dai.balanceOf(USER1);
      let tokenAmountOut = await bPool.calcOutGivenIn(
        holdings1, weight1, holdings0, weight0, toWei(3), swapFee
      );

      await weth.connect(user1).approve(BPOOL, toWei(3));
      await bPool.connect(user1).swapExactAmountIn(
        WETH, toWei(3), DAI, toWei(1), spotPrice.add(toWei(1))
      );
      expect(await dai.balanceOf(USER1)).to.equal(balance0.add(tokenAmountOut));
    });
  });

  describe("swapExactAmountOut", () => {
    it("should be reverted to call swapExactAmountOut", async () => {
      let holdings1 = await vault.holdings1();
      let spotPrice = await bPool.getSpotPrice(DAI, WETH);

      await vault.connect(manager).setPublicSwap(false);

      await expect(
        bPool.connect(user1).swapExactAmountOut(
          ZERO_ADDRESS, toWei(5), WETH, toWei(3), spotPrice
        )
      ).to.be.revertedWith("ERR_NOT_BOUND");

      await expect(
        bPool.connect(user1).swapExactAmountOut(
          DAI, toWei(5), WETH, toWei(3), spotPrice
        )
      ).to.be.revertedWith("ERR_SWAP_NOT_PUBLIC");

      await vault.connect(manager).setPublicSwap(true);

      await expect(
        bPool.connect(user1).swapExactAmountOut(
          DAI, toWei(30), WETH, holdings1.mul(MAX_OUT_RATIO).add(1), spotPrice
        )
      ).to.be.revertedWith("ERR_MAX_OUT_RATIO");

      await expect(
        bPool.connect(user1).swapExactAmountOut(
          DAI, toWei(5), WETH, toWei(3), spotPrice.sub(1)
        )
      ).to.be.revertedWith("ERR_BAD_LIMIT_PRICE");

      await expect(
        bPool.connect(user1).swapExactAmountOut(
          DAI, toWei(5), WETH, toWei(5), spotPrice.add(toWei(1))
        )
      ).to.be.revertedWith("ERR_LIMIT_IN");

      await expect(
        bPool.connect(user1).swapExactAmountOut(
          DAI, toWei(5), WETH, toWei(3), spotPrice
        )
      ).to.be.revertedWith("ERR_LIMIT_PRICE");

      await expect(
        bPool.connect(user1).swapExactAmountOut(
          DAI, toWei(5), WETH, toWei(3), spotPrice.add(toWei(1))
        )
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("should be possible to buy given number of token1", async () => {
      let spotPrice = await bPool.getSpotPrice(DAI, WETH);
      await dai.connect(admin).transfer(USER1, toWei(3));

      await expect(
        bPool.connect(user1).swapExactAmountOut(
          DAI, toWei(5), WETH, toWei(3), spotPrice.add(toWei(1))
        )
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");

      let holdings0 = await vault.holdings0();
      let holdings1 = await vault.holdings1();
      let weight0 = await vault.getDenormalizedWeight(DAI);
      let weight1 = await vault.getDenormalizedWeight(WETH);
      let swapFee = await vault.getSwapFee();
      let balance0 = await dai.balanceOf(USER1);
      let tokenAmountIn = await bPool.calcInGivenOut(
        holdings0, weight0, holdings1, weight1, toWei(3), swapFee
      );

      await dai.connect(user1).approve(BPOOL, toWei(5));
      await bPool.connect(user1).swapExactAmountOut(
        DAI, toWei(5), WETH, toWei(3), spotPrice.add(toWei(1))
      );
      expect(await dai.balanceOf(USER1)).to.equal(balance0.sub(tokenAmountIn));
    });

    it("should be possible to buy given number of token0", async () => {
      let spotPrice = await bPool.getSpotPrice(WETH, DAI);
      await weth.connect(admin).transfer(USER1, toWei(3));

      await expect(
        bPool.connect(user1).swapExactAmountOut(
          WETH, toWei(3), DAI, toWei(1), spotPrice.add(toWei(1))
        )
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");

      let holdings0 = await vault.holdings0();
      let holdings1 = await vault.holdings1();
      let weight0 = await vault.getDenormalizedWeight(DAI);
      let weight1 = await vault.getDenormalizedWeight(WETH);
      let swapFee = await vault.getSwapFee();
      let balance1 = await weth.balanceOf(USER1);
      let tokenAmountIn = await bPool.calcInGivenOut(
        holdings1, weight1, holdings0, weight0, toWei(1), swapFee
      );

      await weth.connect(user1).approve(BPOOL, toWei(3));
      await bPool.connect(user1).swapExactAmountOut(
        WETH, toWei(3), DAI, toWei(1), spotPrice.add(toWei(1))
      );
      expect(await weth.balanceOf(USER1)).to.equal(balance1.sub(tokenAmountIn));
    });
  });
});
