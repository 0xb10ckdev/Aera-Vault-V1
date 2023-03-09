import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { OracleStorage, OracleStorage__factory } from "../../../typechain";
import { baseContext } from "../../common/contexts";
import { ZERO_ADDRESS } from "../constants";
import { setupOracles } from "../fixtures";
import { toUnit } from "../utils";

baseContext("OracleStorage Deployment", function () {
  let oracleStorageFactory: OracleStorage__factory;
  let oracleAddresses: string[];
  let numOracles: number;

  async function setupOraclesFixture(): Promise<{
    oracleAddresses: string[];
    numOracles: number;
    oracleStorageFactory: OracleStorage__factory;
  }> {
    const oracles = await setupOracles(20);
    const oracleAddresses = oracles.map(oracle => oracle.address);
    const numOracles = oracleAddresses.length;

    const oracleStorageFactory =
      await ethers.getContractFactory<OracleStorage__factory>("OracleStorage");

    return {
      oracleAddresses,
      numOracles,
      oracleStorageFactory,
    };
  }

  beforeEach(async function () {
    ({ oracleAddresses, numOracles, oracleStorageFactory } =
      await this.loadFixture(setupOraclesFixture));
  });

  describe("should be reverted to deploy", () => {
    it("when number of tokens and oracles are not same", async () => {
      await expect(
        oracleStorageFactory.deploy(oracleAddresses, 0, numOracles - 1),
      ).to.be.revertedWith("Aera__OracleLengthIsNotSame");
    });

    it("when numeraire asset index exceeds token length", async () => {
      await expect(
        oracleStorageFactory.deploy(oracleAddresses, numOracles, numOracles),
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
            numOracles,
          ),
        ).to.be.revertedWith(`Aera__OracleIsZeroAddress(${i})`);
      }
    });

    it("when numeraire oracle is not zero address", async () => {
      for (let i = 0; i < 20; i++) {
        const invalidAddresses = [...oracleAddresses];

        await expect(
          oracleStorageFactory.deploy(invalidAddresses, i, numOracles),
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
        numOracles,
      );

      expect((await oracle.numeraireAssetIndex()).toNumber()).to.equal(i);
      expect(await oracle.getOracles()).to.eql(validAddresses);
      expect(await oracle.getOracleUnits()).to.eql(oracleUnits);
    }
  });
});
