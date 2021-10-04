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

    return {
      DAI: ERC20Mock__factory.connect(DAI.address, admin),
      WETH: ERC20Mock__factory.connect(WETH.address, admin),
    };
  },
);
