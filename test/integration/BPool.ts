import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import { deployments, ethers } from "hardhat";
import {
  IBPool,
  IBPool__factory,
  IERC20,
  MammonVaultV0,
} from "../../typechain";
import { setupTokens } from "../fixtures";
import { deployVault, toWei } from "../utils";

const ONE_TOKEN = toWei("1");
const MIN_WEIGHT = toWei("1");
const MAX_IN_RATIO = toWei(1 / 2);
const MAX_OUT_RATIO = toWei(1 / 3).add(1);
const ZERO_ADDRESS = ethers.constants.AddressZero;

describe("Swap on Balancer Pool", function () {
  let admin: SignerWithAddress;
  let manager: SignerWithAddress;
  let user: SignerWithAddress;
  let bPool: IBPool;
  let vault: MammonVaultV0;
  let DAI: IERC20, WETH: IERC20;

  before(async function () {
    ({ admin, manager, user } = await ethers.getNamedSigners());

    ({ DAI, WETH } = await setupTokens());

    await deployments.deploy("Validator", {
      contract: "PermissiveWithdrawalValidator",
      from: admin.address,
      log: true,
    });

    vault = await deployVault(
      admin,
      DAI.address,
      WETH.address,
      manager.address,
      (
        await deployments.get("Validator")
      ).address,
    );

    bPool = IBPool__factory.connect(await vault.pool(), admin);

    await DAI.approve(vault.address, ONE_TOKEN);
    await WETH.approve(vault.address, ONE_TOKEN);

    await vault.initialDeposit(ONE_TOKEN, ONE_TOKEN, MIN_WEIGHT, MIN_WEIGHT);

    await DAI.approve(vault.address, toWei(50));
    await WETH.approve(vault.address, toWei(20));

    await vault.deposit(toWei(10), toWei(20));
  });

  describe("bind", () => {
    it("should be reverted to call bind", async () => {
      await expect(
        bPool.bind(DAI.address, ONE_TOKEN, MIN_WEIGHT),
      ).to.be.revertedWith("ERR_NOT_CONTROLLER");
    });
  });

  describe("swapExactAmountIn", () => {
    it("should be reverted to call swapExactAmountIn", async () => {
      const holdings0 = await vault.holdings0();
      const spotPrice = await bPool.getSpotPrice(DAI.address, WETH.address);

      await expect(
        bPool
          .connect(user)
          .swapExactAmountIn(
            ZERO_ADDRESS,
            toWei(3),
            WETH.address,
            toWei(5),
            spotPrice,
          ),
      ).to.be.revertedWith("ERR_NOT_BOUND");

      await expect(
        bPool
          .connect(user)
          .swapExactAmountIn(
            DAI.address,
            toWei(3),
            WETH.address,
            toWei(5),
            spotPrice,
          ),
      ).to.be.revertedWith("ERR_SWAP_NOT_PUBLIC");

      await vault.connect(manager).setPublicSwap(true);

      await expect(
        bPool
          .connect(user)
          .swapExactAmountIn(
            DAI.address,
            holdings0.mul(MAX_IN_RATIO).add(1),
            WETH.address,
            toWei(5),
            spotPrice,
          ),
      ).to.be.revertedWith("ERR_MAX_IN_RATIO");

      await expect(
        bPool
          .connect(user)
          .swapExactAmountIn(
            DAI.address,
            toWei(3),
            WETH.address,
            toWei(5),
            spotPrice.sub(1),
          ),
      ).to.be.revertedWith("ERR_BAD_LIMIT_PRICE");

      await expect(
        bPool
          .connect(user)
          .swapExactAmountIn(
            DAI.address,
            toWei(3),
            WETH.address,
            toWei(5),
            spotPrice.add(toWei(1)),
          ),
      ).to.be.revertedWith("ERR_LIMIT_OUT");

      await expect(
        bPool
          .connect(user)
          .swapExactAmountIn(
            DAI.address,
            toWei(3),
            WETH.address,
            toWei(1),
            spotPrice,
          ),
      ).to.be.revertedWith("ERR_LIMIT_PRICE");

      await expect(
        bPool
          .connect(user)
          .swapExactAmountIn(
            DAI.address,
            toWei(3),
            WETH.address,
            toWei(1),
            spotPrice.add(toWei(1)),
          ),
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("should be possible to sell given number of token0", async () => {
      const spotPrice = await bPool.getSpotPrice(DAI.address, WETH.address);
      await DAI.connect(admin).transfer(user.address, toWei(3));

      await expect(
        bPool
          .connect(user)
          .swapExactAmountIn(
            DAI.address,
            toWei(3),
            WETH.address,
            toWei(1),
            spotPrice.add(toWei(1)),
          ),
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");

      const holdings0 = await vault.holdings0();
      const holdings1 = await vault.holdings1();
      const weight0 = await vault.getDenormalizedWeight(DAI.address);
      const weight1 = await vault.getDenormalizedWeight(WETH.address);
      const swapFee = await vault.getSwapFee();
      const balance1 = await WETH.balanceOf(user.address);

      const tokenAmountOut = await bPool.calcOutGivenIn(
        holdings0,
        weight0,
        holdings1,
        weight1,
        toWei(3),
        swapFee,
      );

      await DAI.connect(user).approve(bPool.address, toWei(3));

      expect(
        await bPool
          .connect(user)
          .estimateGas.swapExactAmountIn(
            DAI.address,
            toWei(3),
            WETH.address,
            toWei(1),
            spotPrice.add(toWei(1)),
          ),
      ).to.below(150000);
      await bPool
        .connect(user)
        .swapExactAmountIn(
          DAI.address,
          toWei(3),
          WETH.address,
          toWei(1),
          spotPrice.add(toWei(1)),
        );

      expect(await WETH.balanceOf(user.address)).to.equal(
        balance1.add(tokenAmountOut),
      );
    });

    it("should be possible to sell given number of token1", async () => {
      const spotPrice = await bPool.getSpotPrice(WETH.address, DAI.address);
      await WETH.connect(admin).transfer(user.address, toWei(3));

      await expect(
        bPool
          .connect(user)
          .swapExactAmountIn(
            WETH.address,
            toWei(3),
            DAI.address,
            toWei(1),
            spotPrice.add(toWei(1)),
          ),
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");

      const holdings0 = await vault.holdings0();
      const holdings1 = await vault.holdings1();
      const weight0 = await vault.getDenormalizedWeight(DAI.address);
      const weight1 = await vault.getDenormalizedWeight(WETH.address);
      const swapFee = await vault.getSwapFee();
      const balance0 = await DAI.balanceOf(user.address);
      const tokenAmountOut = await bPool.calcOutGivenIn(
        holdings1,
        weight1,
        holdings0,
        weight0,
        toWei(3),
        swapFee,
      );

      await WETH.connect(user).approve(bPool.address, toWei(3));
      expect(
        await bPool
          .connect(user)
          .estimateGas.swapExactAmountIn(
            WETH.address,
            toWei(3),
            DAI.address,
            toWei(1),
            spotPrice.add(toWei(1)),
          ),
      ).to.below(150000);
      await bPool
        .connect(user)
        .swapExactAmountIn(
          WETH.address,
          toWei(3),
          DAI.address,
          toWei(1),
          spotPrice.add(toWei(1)),
        );
      expect(await DAI.balanceOf(user.address)).to.equal(
        balance0.add(tokenAmountOut),
      );
    });
  });

  describe("swapExactAmountOut", () => {
    it("should be reverted to call swapExactAmountOut", async () => {
      const holdings1 = await vault.holdings1();
      const spotPrice = await bPool.getSpotPrice(DAI.address, WETH.address);

      await vault.connect(manager).setPublicSwap(false);

      await expect(
        bPool
          .connect(user)
          .swapExactAmountOut(
            ZERO_ADDRESS,
            toWei(5),
            WETH.address,
            toWei(3),
            spotPrice,
          ),
      ).to.be.revertedWith("ERR_NOT_BOUND");

      await expect(
        bPool
          .connect(user)
          .swapExactAmountOut(
            DAI.address,
            toWei(5),
            WETH.address,
            toWei(3),
            spotPrice,
          ),
      ).to.be.revertedWith("ERR_SWAP_NOT_PUBLIC");

      await vault.connect(manager).setPublicSwap(true);

      await expect(
        bPool
          .connect(user)
          .swapExactAmountOut(
            DAI.address,
            toWei(30),
            WETH.address,
            holdings1.mul(MAX_OUT_RATIO).add(1),
            spotPrice,
          ),
      ).to.be.revertedWith("ERR_MAX_OUT_RATIO");

      await expect(
        bPool
          .connect(user)
          .swapExactAmountOut(
            DAI.address,
            toWei(5),
            WETH.address,
            toWei(3),
            spotPrice.sub(1),
          ),
      ).to.be.revertedWith("ERR_BAD_LIMIT_PRICE");

      await expect(
        bPool
          .connect(user)
          .swapExactAmountOut(
            DAI.address,
            toWei(5),
            WETH.address,
            toWei(5),
            spotPrice.add(toWei(1)),
          ),
      ).to.be.revertedWith("ERR_LIMIT_IN");

      await expect(
        bPool
          .connect(user)
          .swapExactAmountOut(
            DAI.address,
            toWei(5),
            WETH.address,
            toWei(3),
            spotPrice,
          ),
      ).to.be.revertedWith("ERR_LIMIT_PRICE");

      await expect(
        bPool
          .connect(user)
          .swapExactAmountOut(
            DAI.address,
            toWei(5),
            WETH.address,
            toWei(3),
            spotPrice.add(toWei(1)),
          ),
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("should be possible to buy given number of token1", async () => {
      const spotPrice = await bPool.getSpotPrice(DAI.address, WETH.address);
      await DAI.connect(admin).transfer(user.address, toWei(3));

      await expect(
        bPool
          .connect(user)
          .swapExactAmountOut(
            DAI.address,
            toWei(5),
            WETH.address,
            toWei(3),
            spotPrice.add(toWei(1)),
          ),
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");

      const holdings0 = await vault.holdings0();
      const holdings1 = await vault.holdings1();
      const weight0 = await vault.getDenormalizedWeight(DAI.address);
      const weight1 = await vault.getDenormalizedWeight(WETH.address);
      const swapFee = await vault.getSwapFee();
      const balance0 = await DAI.balanceOf(user.address);
      const tokenAmountIn = await bPool.calcInGivenOut(
        holdings0,
        weight0,
        holdings1,
        weight1,
        toWei(3),
        swapFee,
      );

      await DAI.connect(user).approve(bPool.address, toWei(5));
      expect(
        await bPool
          .connect(user)
          .estimateGas.swapExactAmountOut(
            DAI.address,
            toWei(5),
            WETH.address,
            toWei(3),
            spotPrice.add(toWei(1)),
          ),
      ).to.below(150000);
      await bPool
        .connect(user)
        .swapExactAmountOut(
          DAI.address,
          toWei(5),
          WETH.address,
          toWei(3),
          spotPrice.add(toWei(1)),
        );
      expect(await DAI.balanceOf(user.address)).to.equal(
        balance0.sub(tokenAmountIn),
      );
    });

    it("should be possible to buy given number of token0", async () => {
      const spotPrice = await bPool.getSpotPrice(WETH.address, DAI.address);
      await WETH.connect(admin).transfer(user.address, toWei(3));

      await expect(
        bPool
          .connect(user)
          .swapExactAmountOut(
            WETH.address,
            toWei(3),
            DAI.address,
            toWei(1),
            spotPrice.add(toWei(1)),
          ),
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");

      const holdings0 = await vault.holdings0();
      const holdings1 = await vault.holdings1();
      const weight0 = await vault.getDenormalizedWeight(DAI.address);
      const weight1 = await vault.getDenormalizedWeight(WETH.address);
      const swapFee = await vault.getSwapFee();
      const balance1 = await WETH.balanceOf(user.address);
      const tokenAmountIn = await bPool.calcInGivenOut(
        holdings1,
        weight1,
        holdings0,
        weight0,
        toWei(1),
        swapFee,
      );

      await WETH.connect(user).approve(bPool.address, toWei(3));
      expect(
        await bPool
          .connect(user)
          .estimateGas.swapExactAmountOut(
            WETH.address,
            toWei(3),
            DAI.address,
            toWei(1),
            spotPrice.add(toWei(1)),
          ),
      ).to.below(150000);
      await bPool
        .connect(user)
        .swapExactAmountOut(
          WETH.address,
          toWei(3),
          DAI.address,
          toWei(1),
          spotPrice.add(toWei(1)),
        );
      expect(await WETH.balanceOf(user.address)).to.equal(
        balance1.sub(tokenAmountIn),
      );
    });
  });
});
