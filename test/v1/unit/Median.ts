import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { ethers } from "hardhat";
import { MammonMedian } from "../../../typechain";

describe("ChainLink Median Functionality", function () {
  let admin: SignerWithAddress;
  let mammonMedian: MammonMedian;
  let snapshot: unknown;

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
    for (let i = 3; i < 20; i++) {
      it(`should be possible to calculate with ${i} submitters`, async () => {
        const list = Array.from({ length: i }, () =>
          ethers.utils.parseEther(
            Math.floor(Math.random() * 10000).toString(),
          ),
        );
        console.log(
          "Estimated Gas: ",
          (await mammonMedian.estimateGas.calculate(list)).toString(),
        );
      });
    }
  });
});
