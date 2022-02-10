import { AssetHelpers } from "@balancer-labs/balancer-js";
import { parseEther } from "@ethersproject/units";
import { ethers } from "hardhat";
import { ERC20Mock, ERC20Mock__factory } from "../typechain";

// https://github.com/balancer-labs/balancer-v2-monorepo/blob/master/pkg/balancer-js/test/tokens.test.ts
const wethAddress = "0x000000000000000000000000000000000000000F";
const assetHelpers = new AssetHelpers(wethAddress);

export const setupTokens = async (): Promise<{
  tokens: ERC20Mock[];
  sortedTokens: string[];
  unsortedTokens: string[];
}> => {
  const { admin } = await ethers.getNamedSigners();

  const tokenDeploys = [];
  const erc20 = await ethers.getContractFactory<ERC20Mock__factory>(
    "ERC20Mock",
  );

  for (let i = 0; i < 4; i++) {
    const token = await erc20
      .connect(admin)
      .deploy(`TOKEN${i} Test`, `TTOKEN${i}`, 18, parseEther("1000000000"));
    tokenDeploys.push(token);
  }

  const tokens = tokenDeploys.map(token =>
    ERC20Mock__factory.connect(token.address, admin),
  );

  const [sortedTokens] = assetHelpers.sortTokens(
    tokens.map(token => token.address),
  );

  tokens.sort(
    (a, b) =>
      sortedTokens.indexOf(a.address) - sortedTokens.indexOf(b.address),
  );

  const unsortedTokens = [];
  for (let i = 0; i < tokens.length; i += 2) {
    if (i + 1 < tokens.length) {
      unsortedTokens.push(tokens[i + 1].address);
    }
    unsortedTokens.push(tokens[i].address);
  }

  return {
    tokens,
    sortedTokens,
    unsortedTokens,
  };
};

export const deployToken = async (): Promise<{
  TOKEN: ERC20Mock;
}> => {
  const { admin } = await ethers.getNamedSigners();

  const erc20 = await ethers.getContractFactory<ERC20Mock__factory>(
    "ERC20Mock",
  );

  const token = await erc20
    .connect(admin)
    .deploy("TOKEN Test", "TTOKEN", 18, parseEther("1000000000"));

  return {
    TOKEN: ERC20Mock__factory.connect(token.address, admin),
  };
};
