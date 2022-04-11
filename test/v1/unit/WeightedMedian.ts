import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { MammonMedian } from "../../../typechain";
import { ONE } from "../constants";
import { toWei } from "../utils";

describe("WeightedMedian Functionality", function () {
  let admin: SignerWithAddress;
  let mammonMedian: MammonMedian;
  let snapshot: unknown;

  const getWeightedMedian = (list: number[], weights: any[]) => {
    const len = list.length;
    for (let j = 0; j < len; j++) {
      for (let k = len - 1; k > j; k--) {
        if (list[k] < list[k - 1]) {
          let temp: any = list[k];
          list[k] = list[k - 1];
          list[k - 1] = temp;
          temp = weights[k];
          weights[k] = weights[k - 1];
          weights[k - 1] = temp;
        }
      }
    }

    let loSum = weights[0];
    let hiSum = toWei("0");
    let index = 0;
    while (loSum.lt(ONE.div(2))) {
      index++;
      loSum = loSum.add(weights[index]);
    }

    hiSum = ONE.sub(loSum);
    loSum = loSum.sub(weights[index]);

    while (loSum.gt(ONE.div(2)) || hiSum.gt(ONE.div(2))) {
      loSum = loSum.add(weights[index]);
      index++;
      hiSum = hiSum.sub(weights[index]);
    }

    return list[index];
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

        const weights = [];
        let totalShare = i;
        Array.from(Array(i).keys()).forEach(i => (totalShare += i));

        let weightSum = toWei("0");
        for (let j = 0; j < i - 1; j++) {
          weights.push(toWei((j + 1) / totalShare));
          weightSum = weightSum.add(weights[j]);
        }
        weights[i - 1] = toWei("1").sub(weightSum);

        gasEstimation.push({
          Submitters: i,
          "Estimated Gas": (
            await mammonMedian.estimateGas.calculateWeightedMedian(
              list,
              weights,
            )
          ).toNumber(),
        });

        expect(
          await mammonMedian.calculateWeightedMedian(list, weights),
        ).to.be.equal(getWeightedMedian(list, weights));

        if (i == 20) {
          console.table(gasEstimation);
        }
      });
    }
  });
});
