import { ethers } from "hardhat";
import { setupVaultWithBalancerVault } from "../fixtures";
import { ONE } from "../../v1/constants";
import {
  AeraVaultV3Mock,
  ERC20Mock,
  IERC20,
  OracleMock,
} from "../../../typechain";
import { setupTokens } from "../fixtures";
import {
  normalizeWeights,
  tokenValueArray,
  tokenWithValues,
  toUnit,
  toWei,
  valueArray,
} from "../utils";

describe("Gas estimation for new rebalancing approach", function () {
  let erc20Tokens: ERC20Mock[];
  let tokens: IERC20[];
  let tokenAddresses: string[];
  let oracles: OracleMock[];
  let vault: AeraVaultV3Mock;
  let snapshot: unknown;
  let gasEstimation: { [method: string]: any } = {};

  beforeEach(async function () {
    snapshot = await ethers.provider.send("evm_snapshot", []);

    erc20Tokens = await setupTokens();
    ({ tokens, tokenAddresses, oracles, vault } =
      await setupVaultWithBalancerVault());

    for (let i = 0; i < 20; i++) {
      await erc20Tokens[i].transfer(vault.address, ONE);
    }

    for (let i = 0; i < tokens.length; i++) {
      await tokens[i].approve(vault.address, toWei(100));
    }

    for (let i = 1; i < oracles.length; i++) {
      await oracles[i].setLatestAnswer(toUnit(1, 8));
    }

    await vault.initialDeposit(
      tokenValueArray(tokenAddresses, ONE, tokens.length),
      tokenWithValues(
        tokenAddresses,
        normalizeWeights(valueArray(ONE, tokens.length)),
      ),
    );
  });

  afterEach(async function () {
    await ethers.provider.send("evm_revert", [snapshot]);
  });

  describe("Approve Tokens", function () {
    before(function () {
      gasEstimation = {};
    });

    after(function () {
      console.log("Approve Tokens");
      console.table(gasEstimation);
    });

    it("should be possible to approve tokens", async function () {
      let estimation = 0;

      for (let i = 0; i < 10; i++) {
        estimation += (
          await erc20Tokens[i].estimateGas.approve(vault.address, ONE)
        ).toNumber();
      }

      gasEstimation["Approve 10 tokens"] = estimation;
    });
  });

  describe("Bind Tokens", async function () {
    before(function () {
      gasEstimation = {};
    });

    after(function () {
      console.log("Bind Tokens");
      console.table(gasEstimation);
    });

    for (let i = 0; i <= 4; i += 2) {
      describe(`when pool has ${4 + i} tokens`, async function () {
        beforeEach(async function () {
          await vault.depositAndBindTokens(
            erc20Tokens.slice(16, 16 + i).map(token => token.address),
          );
        });

        for (let j = 3; j <= 15; j += 3) {
          it(`should be possible to bind ${j} tokens`, async function () {
            const estimation = (
              await vault.estimateGas.depositAndBindTokens(
                erc20Tokens.slice(0, j).map(token => token.address),
              )
            ).toNumber();
            if (!gasEstimation[`Bind and deposit ${j} tokens`]) {
              gasEstimation[`Bind and deposit ${j} tokens`] = {};
            }
            gasEstimation[`Bind and deposit ${j} tokens`][
              `when pool has ${4 + i} tokens`
            ] = estimation;
          });
        }
      });
    }
  });

  describe("Unbind Tokens", function () {
    before(function () {
      gasEstimation = {};
    });

    after(function () {
      console.log("Unbind Tokens");
      console.table(gasEstimation);
    });

    for (let i = 3; i <= 15; i += 3) {
      describe(`when pool has ${4 + i} tokens`, async function () {
        beforeEach(async function () {
          await vault.depositAndBindTokens(
            erc20Tokens.slice(0, i).map(token => token.address),
          );
        });

        for (let j = 3; j <= i; j += 3) {
          it(`should be possible to unbind ${j} tokens`, async function () {
            const estimation = (
              await vault.estimateGas.unbindAndWithdrawTokens(
                erc20Tokens.slice(0, j).map(token => token.address),
              )
            ).toNumber();
            if (!gasEstimation[`Withdraw and unbind ${j} tokens`]) {
              gasEstimation[`Withdraw and unbind ${j} tokens`] = {};
            }
            gasEstimation[`Withdraw and unbind ${j} tokens`][
              `when pool has ${4 + i} tokens`
            ] = estimation;
          });
        }
      });
    }
  });
});
