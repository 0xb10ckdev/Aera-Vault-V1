import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { MammonMedian } from "../../../typechain";
import { ONE } from "../constants";
import { toWei } from "../utils";

describe("ChainLink Median Functionality", function () {
  let admin: SignerWithAddress;
  let mammonMedian: MammonMedian;
  let snapshot: unknown;
  let testList: any[];
  const testWeights: any = {};
  const gasEstimation: any = {};

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

  const getSortedLinkedMedian = (list: number[]) => {
    const len = list.length;

    const pivot = Math.floor(len / 2);
    list.sort((a: number, b: number) => a - b);

    return list[pivot];
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

  this.beforeAll(() => {
    testList = Array.from({ length: 20 }, () =>
      Math.floor(Math.random() * 10000),
    );

    for (let i = 3; i <= 20; i++) {
      gasEstimation[i] = {};

      const weights = [];
      let totalShare = i;
      Array.from(Array(i).keys()).forEach(n => (totalShare += n));

      let weightSum = toWei("0");
      for (let j = 0; j < i - 1; j++) {
        weights.push(toWei((j + 1) / totalShare));
        weightSum = weightSum.add(weights[j]);
      }
      weights[i - 1] = toWei("1").sub(weightSum);

      testWeights[i] = weights;
    }
  });

  this.afterAll(() => {
    console.log("Gas Estimation");
    console.table(gasEstimation);
  });

  describe("chainlink", () => {
    for (let i = 3; i <= 20; i++) {
      it(`should be possible to calculate with ${i} submitters`, async () => {
        const list = Array.from({ length: i }, () =>
          Math.floor(Math.random() * 10000),
        );

        gasEstimation[i]["Chainlink"] = (
          await mammonMedian.estimateGas.calculateWithChainLink(list)
        ).toNumber();

        expect(await mammonMedian.calculateWithChainLink(list)).to.be.equal(
          getMedian(list),
        );
      });
    }
  });

  describe("weighted median", async () => {
    for (let i = 3; i <= 20; i++) {
      it(`should be possible to calculate with ${i} submitters`, async () => {
        const list = testList.slice(0, i);
        const weights = testWeights[i];

        gasEstimation[i]["Weighted Median"] = (
          await mammonMedian.estimateGas.calculateWithWeightedMedian(
            list,
            weights,
          )
        ).toNumber();

        expect(
          await mammonMedian.calculateWithWeightedMedian(list, weights),
        ).to.be.equal(getWeightedMedian(list, weights));
      });
    }
  });

  describe("median oracle", () => {
    for (let i = 3; i <= 20; i++) {
      it(`should be possible to calculate with ${i} submitters`, async () => {
        const list = testList.slice(0, i);

        gasEstimation[i]["Median Oracle"] = (
          await mammonMedian.estimateGas.calculateWithMedianOracle(list)
        ).toNumber();

        expect(await mammonMedian.calculateWithMedianOracle(list)).to.be.equal(
          getMedian(list),
        );
      });
    }
  });

  describe("uint median", () => {
    for (let i = 3; i <= 20; i++) {
      it(`should be possible to calculate with ${i} submitters`, async () => {
        const list = testList.slice(0, i);

        gasEstimation[i]["Uint Median"] = (
          await mammonMedian.estimateGas.calculateWithUintMedian(list)
        ).toNumber();

        expect(await mammonMedian.calculateWithUintMedian(list)).to.be.equal(
          getMedian(list),
        );
      });
    }
  });

  describe("uint weighted median", async () => {
    for (let i = 3; i <= 20; i++) {
      it(`should be possible to calculate with ${i} submitters`, async () => {
        const list = testList.slice(0, i);
        const weights = testWeights[i];

        gasEstimation[i]["Uint Weighted Median"] = (
          await mammonMedian.estimateGas.calculateWithUintWeightedMedian(
            list,
            weights,
          )
        ).toNumber();

        expect(
          await mammonMedian.calculateWithUintWeightedMedian(list, weights),
        ).to.be.equal(getWeightedMedian(list, weights));
      });
    }
  });

  describe("sorted linked median", () => {
    for (let i = 3; i <= 20; i++) {
      it(`should be possible to calculate with ${i} submitters`, async () => {
        const list = testList.slice(0, i);

        const gasCost = (
          await mammonMedian.estimateGas.updateList(list)
        ).toNumber();

        await mammonMedian.updateList(list);

        gasEstimation[i]["Sorted Linked Median"] =
          gasCost +
          (
            await mammonMedian.estimateGas.calculateWithSortedLinkedMedian()
          ).toNumber();

        expect(
          await mammonMedian.calculateWithSortedLinkedMedian(),
        ).to.be.equal(getSortedLinkedMedian(list));
      });
    }
  });
});
