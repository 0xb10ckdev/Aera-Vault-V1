import { ethers } from "hardhat";
import { OracleMock, OracleMock__factory } from "../../typechain";

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
