import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { MammonMedian } from "../../../typechain";

describe("ChainLink Median Functionality", function () {
  let admin: SignerWithAddress;
  let mammonMedian: MammonMedian;
  let snapshot: unknown;

  const getMedian = (list: number[]) => {
    const len = list.length;

    const pivot = Math.floor(len / 2);
    list.sort((a: number, b: number) => a - b);
    const listMedian =
      len % 2 == 0
        ? Math.floor((Number(list[pivot - 1]) + Number(list[pivot])) / 2)
        : list[pivot];

    return listMedian;
  };

  beforeEach(async function () {
    snapshot = await ethers.provider.send("evm_snapshot", []);

    const signers = await ethers.getSigners();
    admin = signers[0];

    const contractFactory = await ethers.getContractFactory("MammonMedian");

    mammonMedian = (await contractFactory
      .connect(admin)
      .deploy()) as MammonMedian;
  });

  afterEach(async () => {
    await ethers.provider.send("evm_revert", [snapshot]);
  });

  describe("calculate", () => {
    const gasEstimation: any[] = [];
    for (let i = 3; i <= 20; i++) {
      it(`should be possible to calculate with ${i} submitters`, async () => {
        const list = Array.from({ length: i }, () =>
          Math.floor(Math.random() * 10000),
        );

        gasEstimation.push({
          Submitters: i,
          "Estimated Gas": (
            await mammonMedian.estimateGas.calculateMedian(list)
          ).toNumber(),
        });

        expect(await mammonMedian.calculateMedian(list)).to.be.equal(
          getMedian(list),
        );

        if (i == 20) {
          console.table(gasEstimation);
        }
      });
    }
  });
});
