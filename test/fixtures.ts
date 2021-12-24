import { parseEther } from "@ethersproject/units";
import { deployments } from "hardhat";
import { ERC20Mock__factory } from "../typechain";

export const setupTokens = deployments.createFixture(
  async ({ deployments, ethers }) => {
    const { deploy } = deployments;
    const { admin } = await ethers.getNamedSigners();

    const tokenDeploys = [];

    for (let i = 0; i < 4; i++) {
      const token = await deploy(`TOKEN${i}`, {
        contract: "ERC20Mock",
        from: admin.address,
        args: [`TOKEN${i} Test`, `TTOKEN${i}`, 18, parseEther("1000000000")],
      });
      tokenDeploys.push(token);
    }

    const tokens = tokenDeploys
      .map(token => ERC20Mock__factory.connect(token.address, admin))
      .sort((a, b) => (a.address < b.address ? -1 : 1));

    const sortedTokens = [];
    const unsortedTokens = [];

    for (let i = 0; i < tokens.length; i += 2) {
      sortedTokens.push(tokens[i].address);
      if (i + 1 < tokens.length) {
        sortedTokens.push(tokens[i + 1].address);
        unsortedTokens.push(tokens[i + 1].address);
      }
      unsortedTokens.push(tokens[i].address);
    }

    return {
      tokens,
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
