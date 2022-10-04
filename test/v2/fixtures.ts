import { ethers } from "hardhat";
import {
  ERC4626Mock,
  ERC4626Mock__factory,
  OracleMock,
  OracleMock__factory,
} from "../../typechain";

export * from "../v1/fixtures";

export const setupOracles = async (
  length: number = 4,
): Promise<OracleMock[]> => {
  const { admin } = await ethers.getNamedSigners();

  const oracleDeploys = [];
  const oracleFactory = await ethers.getContractFactory<OracleMock__factory>(
    "OracleMock",
  );

  for (let i = 0; i < length; i++) {
    const oracle = await oracleFactory.connect(admin).deploy(8);
    oracleDeploys.push(oracle);
  }

  const oracles = oracleDeploys.map(oracle =>
    OracleMock__factory.connect(oracle.address, admin),
  );

  return oracles;
};

export const setupYieldBearingAssets = async (
  underlyingAssets: string[],
): Promise<ERC4626Mock[]> => {
  const { admin } = await ethers.getNamedSigners();

  const tokenDeploys: ERC4626Mock[] = [];
  const erc4626Mock = await ethers.getContractFactory<ERC4626Mock__factory>(
    "ERC4626Mock",
  );

  for (const underlyingAsset of underlyingAssets) {
    const erc20 = await ethers.getContractAt("ERC20Mock", underlyingAsset);
    const token = await erc4626Mock
      .connect(admin)
      .deploy(
        underlyingAsset,
        `YIELD BEARING ${await erc20.name()}`,
        `YB ${await erc20.symbol()}`,
      );
    tokenDeploys.push(token);
  }

  const tokens = tokenDeploys.map(token =>
    ERC4626Mock__factory.connect(token.address, admin),
  );

  return tokens;
};
