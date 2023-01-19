import { baseContext } from "../../shared/contexts";
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

baseContext("Gas estimation for new rebalancing approach", function () {
  let erc20Tokens: ERC20Mock[];
  let tokens: IERC20[];
  let tokenAddresses: string[];
  let oracles: OracleMock[];
  let vault: AeraVaultV3Mock;
  const gasEstimation: { [method: string]: number } = {};

  before(async function () {
    erc20Tokens = await this.loadFixture(setupTokens);
    ({ tokens, tokenAddresses, oracles, vault } = await this.loadFixture(
      setupVaultWithBalancerVault,
    ));

    for (let i = 0; i < tokens.length; i++) {
      await tokens[i].approve(vault.address, toWei(100));
    }

    for (let i = 1; i < this.numPoolTokens; i++) {
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

  after(function () {
    console.log("Gas Estimation");
    console.table(gasEstimation);
  });

  describe("Approve Tokens", function () {
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

  describe("Bind Tokens", function () {
    it("should be possible to bind tokens", async function () {
      for (let i = 0; i < 3; i++) {
        await erc20Tokens[i].transfer(vault.address, ONE);
      }

      gasEstimation["Bind and deposit 3 tokens"] = (
        await vault.estimateGas.depositAndBindTokens(
          erc20Tokens.slice(0, 3).map(token => token.address),
        )
      ).toNumber();
    });
  });

  describe("Unbind Tokens", function () {
    it("should be possible to unbind tokens", async function () {
      await vault.depositAndBindTokens(
        erc20Tokens.slice(0, 3).map(token => token.address),
      );
      gasEstimation["Withdraw and unbind 3 tokens"] = (
        await vault.estimateGas.unbindAndWithdrawTokens(
          tokens.slice(0, 3).map(token => token.address),
        )
      ).toNumber();
    });
  });
});
