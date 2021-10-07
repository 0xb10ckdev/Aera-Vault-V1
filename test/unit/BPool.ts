import { ethers, waffle, artifacts } from "hardhat";
import { Artifact } from "hardhat/types";
import { Signer } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import { toWei } from "../utils";
import {
  PermissiveWithdrawalValidator,
  BFactoryMock,
  BPoolMock,
  ERC20Mock,
  MammonVaultV0Mock,
  BPoolMock__factory
} from "../../typechain";

const { deployContract } = waffle;

const ONE_TOKEN = toWei("1");
const MIN_WEIGHT = toWei("1");
const MAX_IN_RATIO = toWei(1 / 2);
const MAX_OUT_RATIO = toWei(1 / 3).add(1);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

describe("Swap on Balancer Pool", function () {
  let signers: SignerWithAddress[];
  let validator: PermissiveWithdrawalValidator;
  let bFactory: BFactoryMock;
  let bPool: BPoolMock;
  let admin: Signer;
  let manager: Signer;
  let user1: Signer;
  let vault: MammonVaultV0Mock;
  let dai: ERC20Mock;
  let weth: ERC20Mock;

  let ADMIN: string, MANAGER: string, USER1: string;
  let DAI: string, WETH: string;
  let VAULT: string, BPOOL: string;

  const NOTICE_PERIOD = 10000;

  // before(async function () {
  //   signers = await ethers.getSigners();
  //   admin = signers[0];
  //   manager = signers[1];
  //   user1 = signers[2];
  //   ADMIN = await admin.getAddress();
  //   MANAGER = await manager.getAddress();
  //   USER1 = await user1.getAddress();

  //   const validatorArtifact: Artifact = await artifacts.readArtifact(
  //     "PermissiveWithdrawalValidator",
  //   );
  //   validator = <PermissiveWithdrawalValidator>(
  //     await deployContract(admin, validatorArtifact)
  //   );

  //   const bFactoryArtifact: Artifact = await artifacts.readArtifact(
  //     "BFactoryMock",
  //   );
  //   bFactory = <BFactoryMock>(
  //     await deployContract(admin, bFactoryArtifact)
  //   );

  //   const erc20MockArtifact: Artifact = await artifacts.readArtifact(
  //     "ERC20Mock",
  //   );
  //   dai = <ERC20Mock>(
  //     await deployContract(admin, erc20MockArtifact, ["weth", "WETH"])
  //   );
  //   weth = <ERC20Mock>(
  //     await deployContract(admin, erc20MockArtifact, ["dai", "DAI"])
  //   );

  //   DAI = dai.address;
  //   WETH = weth.address;
  // });

  // describe("Vault Initialization", () => {
  //   it("vault should be deployed", async () => {
  //     const vaultArtifact: Artifact = await artifacts.readArtifact(
  //       "MammonVaultV0Mock",
  //     );

  //     vault = <MammonVaultV0Mock>(
  //       await deployContract(admin, vaultArtifact, [
  //         bFactory.address,
  //         dai.address,
  //         weth.address,
  //         MANAGER,
  //         validator.address,
  //         NOTICE_PERIOD
  //       ])
  //     );
  //     VAULT = vault.address;

  //     bPool = BPoolMock__factory.connect(await vault.pool(), admin.provider!);
  //     BPOOL = bPool.address;
  
  //     await dai.mint(ADMIN, ONE_TOKEN);
  //     await weth.mint(ADMIN, ONE_TOKEN);
  //     await dai.approve(VAULT, ONE_TOKEN);
  //     await weth.approve(VAULT, ONE_TOKEN);

  //     await vault.initialDeposit(ONE_TOKEN, ONE_TOKEN, MIN_WEIGHT, MIN_WEIGHT);
      
  //     await dai.mint(ADMIN, toWei(50));
  //     await weth.mint(ADMIN, toWei(20));
  //     await dai.approve(VAULT, toWei(50));
  //     await weth.approve(VAULT, toWei(20));
  
  //     await vault.deposit(toWei(10), toWei(20));
  //   });
  // });

  // describe("swapExactAmountIn", () => {
  //   it("should be reverted to call swapExactAmountIn", async () => {
  //     let holdings0 = await vault.holdings0();
  //     let spotPrice = await bPool.getSpotPrice(DAI, WETH);

  //     await expect(
  //       bPool.connect(user1).swapExactAmountIn(
  //         ZERO_ADDRESS, toWei(3), WETH, toWei(5), spotPrice
  //       )
  //     ).to.be.revertedWith("ERR_NOT_BOUND");

  //     await expect(
  //       bPool.connect(user1).swapExactAmountIn(
  //         DAI, toWei(3), WETH, toWei(5), spotPrice
  //       )
  //     ).to.be.revertedWith("ERR_SWAP_NOT_PUBLIC");

  //     await vault.connect(manager).setPublicSwap(true);

  //     await expect(
  //       bPool.connect(user1).swapExactAmountIn(
  //         DAI, holdings0.mul(MAX_IN_RATIO).add(1), WETH, toWei(5), spotPrice
  //       )
  //     ).to.be.revertedWith("ERR_MAX_IN_RATIO");

  //     await expect(
  //       bPool.connect(user1).swapExactAmountIn(
  //         DAI, toWei(3), WETH, toWei(5), spotPrice.sub(1)
  //       )
  //     ).to.be.revertedWith("ERR_BAD_LIMIT_PRICE");

  //     await expect(
  //       bPool.connect(user1).swapExactAmountIn(
  //         DAI, toWei(3), WETH, toWei(5), spotPrice.add(toWei(1))
  //       )
  //     ).to.be.revertedWith("ERR_LIMIT_OUT");

  //     await expect(
  //       bPool.connect(user1).swapExactAmountIn(
  //         DAI, toWei(3), WETH, toWei(1), spotPrice
  //       )
  //     ).to.be.revertedWith("ERR_LIMIT_PRICE");

  //     await expect(
  //       bPool.connect(user1).swapExactAmountIn(
  //         DAI, toWei(3), WETH, toWei(1), spotPrice.add(toWei(1))
  //       )
  //     ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
  //   });

  //   it("should be possible to sell given number of token0", async () => {
  //     let spotPrice = await bPool.getSpotPrice(DAI, WETH);
  //     await dai.mint(USER1, toWei(3));

  //     await expect(
  //       bPool.connect(user1).swapExactAmountIn(
  //         DAI, toWei(3), WETH, toWei(1), spotPrice.add(toWei(1))
  //       )
  //     ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");

  //     let holdings0 = await vault.holdings0();
  //     let holdings1 = await vault.holdings1();
  //     let weight0 = await vault.getDenormalizedWeight(DAI);
  //     let weight1 = await vault.getDenormalizedWeight(WETH);
  //     let swapFee = await vault.getSwapFee();
  //     let balance1 = await weth.balanceOf(USER1);
  //     let tokenAmountOut = await bPool.calcOutGivenIn(
  //       holdings0, weight0, holdings1, weight1, toWei(3), swapFee
  //     );

  //     await dai.connect(user1).approve(BPOOL, toWei(3));
  //     await bPool.connect(user1).swapExactAmountIn(
  //       DAI, toWei(3), WETH, toWei(1), spotPrice.add(toWei(1))
  //     );
  //     expect(await weth.balanceOf(USER1)).to.equal(balance1.add(tokenAmountOut));
  //   });

  //   it("should be possible to sell given number of token1", async () => {
  //     let spotPrice = await bPool.getSpotPrice(WETH, DAI);
  //     await weth.mint(USER1, toWei(3));

  //     await expect(
  //       bPool.connect(user1).swapExactAmountIn(
  //         WETH, toWei(3), DAI, toWei(1), spotPrice.add(toWei(1))
  //       )
  //     ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");

  //     let holdings0 = await vault.holdings0();
  //     let holdings1 = await vault.holdings1();
  //     let weight0 = await vault.getDenormalizedWeight(DAI);
  //     let weight1 = await vault.getDenormalizedWeight(WETH);
  //     let swapFee = await vault.getSwapFee();
  //     let balance0 = await dai.balanceOf(USER1);
  //     let tokenAmountOut = await bPool.calcOutGivenIn(
  //       holdings1, weight1, holdings0, weight0, toWei(3), swapFee
  //     );

  //     await weth.connect(user1).approve(BPOOL, toWei(3));
  //     await bPool.connect(user1).swapExactAmountIn(
  //       WETH, toWei(3), DAI, toWei(1), spotPrice.add(toWei(1))
  //     );
  //     expect(await dai.balanceOf(USER1)).to.equal(balance0.add(tokenAmountOut));
  //   });
  // });

  // describe("swapExactAmountOut", () => {
  //   it("should be reverted to call swapExactAmountOut", async () => {
  //     let holdings1 = await vault.holdings1();
  //     let spotPrice = await bPool.getSpotPrice(DAI, WETH);

  //     await vault.connect(manager).setPublicSwap(false);

  //     await expect(
  //       bPool.connect(user1).swapExactAmountOut(
  //         ZERO_ADDRESS, toWei(5), WETH, toWei(3), spotPrice
  //       )
  //     ).to.be.revertedWith("ERR_NOT_BOUND");

  //     await expect(
  //       bPool.connect(user1).swapExactAmountOut(
  //         DAI, toWei(5), WETH, toWei(3), spotPrice
  //       )
  //     ).to.be.revertedWith("ERR_SWAP_NOT_PUBLIC");

  //     await vault.connect(manager).setPublicSwap(true);

  //     await expect(
  //       bPool.connect(user1).swapExactAmountOut(
  //         DAI, toWei(30), WETH, holdings1.mul(MAX_OUT_RATIO).add(1), spotPrice
  //       )
  //     ).to.be.revertedWith("ERR_MAX_OUT_RATIO");

  //     await expect(
  //       bPool.connect(user1).swapExactAmountOut(
  //         DAI, toWei(5), WETH, toWei(3), spotPrice.sub(1)
  //       )
  //     ).to.be.revertedWith("ERR_BAD_LIMIT_PRICE");

  //     await expect(
  //       bPool.connect(user1).swapExactAmountOut(
  //         DAI, toWei(5), WETH, toWei(5), spotPrice.add(toWei(1))
  //       )
  //     ).to.be.revertedWith("ERR_LIMIT_IN");

  //     await expect(
  //       bPool.connect(user1).swapExactAmountOut(
  //         DAI, toWei(5), WETH, toWei(3), spotPrice
  //       )
  //     ).to.be.revertedWith("ERR_LIMIT_PRICE");

  //     await expect(
  //       bPool.connect(user1).swapExactAmountOut(
  //         DAI, toWei(5), WETH, toWei(3), spotPrice.add(toWei(1))
  //       )
  //     ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
  //   });

  //   it("should be possible to buy given number of token1", async () => {
  //     let spotPrice = await bPool.getSpotPrice(DAI, WETH);
  //     await dai.mint(USER1, toWei(3));

  //     await expect(
  //       bPool.connect(user1).swapExactAmountOut(
  //         DAI, toWei(5), WETH, toWei(3), spotPrice.add(toWei(1))
  //       )
  //     ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");

  //     let holdings0 = await vault.holdings0();
  //     let holdings1 = await vault.holdings1();
  //     let weight0 = await vault.getDenormalizedWeight(DAI);
  //     let weight1 = await vault.getDenormalizedWeight(WETH);
  //     let swapFee = await vault.getSwapFee();
  //     let balance0 = await dai.balanceOf(USER1);
  //     let tokenAmountIn = await bPool.calcInGivenOut(
  //       holdings0, weight0, holdings1, weight1, toWei(3), swapFee
  //     );

  //     await dai.connect(user1).approve(BPOOL, toWei(5));
  //     await bPool.connect(user1).swapExactAmountOut(
  //       DAI, toWei(5), WETH, toWei(3), spotPrice.add(toWei(1))
  //     );
  //     expect(await dai.balanceOf(USER1)).to.equal(balance0.sub(tokenAmountIn));
  //   });

  //   it("should be possible to buy given number of token0", async () => {
  //     let spotPrice = await bPool.getSpotPrice(WETH, DAI);
  //     await weth.mint(USER1, toWei(3));

  //     await expect(
  //       bPool.connect(user1).swapExactAmountOut(
  //         WETH, toWei(3), DAI, toWei(1), spotPrice.add(toWei(1))
  //       )
  //     ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");

  //     let holdings0 = await vault.holdings0();
  //     let holdings1 = await vault.holdings1();
  //     let weight0 = await vault.getDenormalizedWeight(DAI);
  //     let weight1 = await vault.getDenormalizedWeight(WETH);
  //     let swapFee = await vault.getSwapFee();
  //     let balance1 = await weth.balanceOf(USER1);
  //     let tokenAmountIn = await bPool.calcInGivenOut(
  //       holdings1, weight1, holdings0, weight0, toWei(1), swapFee
  //     );

  //     await weth.connect(user1).approve(BPOOL, toWei(3));
  //     await bPool.connect(user1).swapExactAmountOut(
  //       WETH, toWei(3), DAI, toWei(1), spotPrice.add(toWei(1))
  //     );
  //     expect(await weth.balanceOf(USER1)).to.equal(balance1.sub(tokenAmountIn));
  //   });
  // });
});