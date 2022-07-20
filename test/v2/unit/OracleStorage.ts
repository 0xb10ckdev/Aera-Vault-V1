import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import {
  OracleStorage__factory,
  OracleMock,
  OracleStorage,
} from "../../../typechain";
import { ZERO_ADDRESS } from "../constants";
import { setupOracles } from "../fixtures";
import { toUnit } from "../utils";

describe("OracleStorage Deployment", function () {
  let oracleStorageFactory: OracleStorage__factory;
  let oracles: OracleMock[];
  let oracleAddresses: string[];
  let snapshot: unknown;

  beforeEach(async function () {
    snapshot = await ethers.provider.send("evm_snapshot", []);

    oracles = await setupOracles(20);
    oracleAddresses = oracles.map((oracle: OracleMock) => oracle.address);

    oracleStorageFactory =
      await ethers.getContractFactory<OracleStorage__factory>("OracleStorage");
  });

  afterEach(async () => {
    await ethers.provider.send("evm_revert", [snapshot]);
  });

  describe("should be reverted to deploy", () => {
    it("when number of tokens and oracles are not same", async () => {
      await expect(
        oracleStorageFactory.deploy(
          oracleAddresses,
          0,
          oracleAddresses.length - 1,
        ),
      ).to.be.revertedWith("Aera__OracleLengthIsNotSame");
    });

    it("when numeraire asset index exceeds token length", async () => {
      await expect(
        oracleStorageFactory.deploy(
          oracleAddresses,
          oracleAddresses.length,
          oracleAddresses.length,
        ),
      ).to.be.revertedWith("Aera__NumeraireAssetIndexExceedsTokenLength");
    });

    it("when oracle is zero address", async () => {
      for (let i = 0; i < 20; i++) {
        const invalidAddresses = [...oracleAddresses];
        invalidAddresses[i == 0 ? 1 : 0] = ZERO_ADDRESS;
        invalidAddresses[i] = ZERO_ADDRESS;

        await expect(
          oracleStorageFactory.deploy(
            invalidAddresses,
            i == 0 ? 1 : 0,
            oracleAddresses.length,
          ),
        ).to.be.revertedWith(`Aera__OracleIsZeroAddress(${i})`);
      }
    });

    it("when numeraire oracle is not zero address", async () => {
      for (let i = 0; i < 20; i++) {
        const invalidAddresses = [...oracleAddresses];

        await expect(
          oracleStorageFactory.deploy(
            invalidAddresses,
            i,
            oracleAddresses.length,
          ),
        ).to.be.revertedWith(`Aera__NumeraireOracleIsNotZeroAddress(${i})`);
      }
    });
  });

  it("should be possible to deploy", async () => {
    for (let i = 0; i < 20; i++) {
      const validAddresses = [...oracleAddresses];
      validAddresses[i] = ZERO_ADDRESS;
      const oracleUnits = Array(20).fill(toUnit(1, 8));
      oracleUnits[i] = BigNumber.from(0);

      const oracle: OracleStorage = await oracleStorageFactory.deploy(
        validAddresses,
        i,
        oracleAddresses.length,
      );

      expect((await oracle.numeraireAssetIndex()).toNumber()).to.equal(i);
      expect(await oracle.getOracles()).to.eql(validAddresses);
      expect(await oracle.getOracleUnits()).to.eql(oracleUnits);
    }
  });
});
