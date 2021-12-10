import { parseEther } from "@ethersproject/units";
import { deployments } from "hardhat";
import { ERC20Mock__factory } from "../typechain";

export const setupTokens = deployments.createFixture(
  async ({ deployments, ethers }) => {
    const { deploy } = deployments;
    const { admin } = await ethers.getNamedSigners();

    const DAI = await deploy("DAI", {
      contract: "ERC20Mock",
      from: admin.address,
      args: ["DAI Test", "TDAI", 18, parseEther("1000000000")],
    });

    const WETH = await deploy("WETH", {
      contract: "ERC20Mock",
      from: admin.address,
      args: ["WETH Test", "TWETH", 18, parseEther("1000000000")],
    });

    let sortedTokens = [];
    let unsortedTokens = [];
    if (DAI.address < WETH.address) {
      sortedTokens = [DAI.address, WETH.address];
      unsortedTokens = [WETH.address, DAI.address];
    } else {
      sortedTokens = [WETH.address, DAI.address];
      unsortedTokens = [DAI.address, WETH.address];
    }

    return {
      DAI: ERC20Mock__factory.connect(DAI.address, admin),
      WETH: ERC20Mock__factory.connect(WETH.address, admin),
      sortedTokens,
      unsortedTokens,
    };
  },
);

export const deployToken = deployments.createFixture(
  async ({ deployments, ethers }) => {
    const { deploy } = deployments;
    const { admin } = await ethers.getNamedSigners();

    const TOKEN = await deploy("TOKEN", {
      contract: "ERC20Mock",
      from: admin.address,
      args: ["TOKEN Test", "TTOKEN", 18, parseEther("1000000000")],
    });

    return {
      TOKEN: ERC20Mock__factory.connect(TOKEN.address, admin),
    };
  },
);
