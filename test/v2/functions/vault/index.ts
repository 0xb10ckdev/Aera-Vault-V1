import { ONE } from "../../constants";
import {
  normalizeWeights,
  tokenValueArray,
  tokenWithValues,
  toUnit,
  toWei,
  valueArray,
} from "../../utils";
import { testFunctionCallsWhenFinalized } from "./callFunctionsWhenFinalized";
import { testFunctionCallsWhenNotInitialized } from "./callFunctionsWhenNotInitialized";
import { testCancelWeightUpdates } from "./cancelWeightUpdates";
import { testClaimManagerFees } from "./claimManagerFees";
import { testDeposit } from "./deposit";
import { testDepositAndWithdraw } from "./depositAndWithdraw";
import { testDepositRiskingArbitrage } from "./depositRiskingArbitrage";
import { testDisableTrading } from "./disableTrading";
import { testEnableTradingRiskingArbitrage } from "./enableTradingRiskingArbitrage";
import { testEnableTradingWithOraclePrice } from "./enableTradingWithOraclePrice";
import { testEnableTradingWithWeights } from "./enableTradingWithWeights";
import { testFinalize } from "./finalize";
import { testGetSpotPrices } from "./getSpotPrices";
import { testInitialDeposit } from "./initialDeposit";
import { testMulticall } from "./multicall";
import { testOwnership } from "./ownership";
import { testSetManager } from "./setManager";
import { testSetOraclesEnabled } from "./setOraclesEnabled";
import { testSetSwapFee } from "./setSwapFee";
import { testSweep } from "./sweep";
import { testUpdateWeightsGradually } from "./updateWeightsGradually";
import { testWithdraw } from "./withdraw";

export function testAeraVaultV2(): void {
  describe("Aera Vault V2 Mainnet Functionality", function () {
    describe("when Vault not initialized", function () {
      describe("should be reverted to call functions", async function () {
        testFunctionCallsWhenNotInitialized();
      });

      describe("initialize Vault", function () {
        testInitialDeposit();
      });
    });

    describe("when Vault is initialized", function () {
      beforeEach(async function () {
        for (let i = 0; i < this.numTokens; i++) {
          await this.tokens[i].approve(this.vault.address, toWei(100));
        }

        for (let i = 1; i < this.numPoolTokens; i++) {
          await this.oracles[i].setLatestAnswer(toUnit(1, 8));
        }

        await this.vault.initialDeposit(
          tokenValueArray(this.tokenAddresses, ONE, this.numTokens),
          tokenWithValues(
            this.tokenAddresses,
            normalizeWeights(valueArray(ONE, this.numTokens)),
          ),
        );
      });

      describe("when depositing to Vault", function () {
        describe("with deposit function", async function () {
          testDeposit();
        });

        describe("with depositRiskingArbitrage function", async function () {
          testDepositRiskingArbitrage();
        });
      });

      describe("when withdrawing from Vault", function () {
        testWithdraw();
      });

      describe("when depositing and withdrawing", function () {
        testDepositAndWithdraw();
      });

      describe("when call updateWeightsGradually()", function () {
        testUpdateWeightsGradually();
      });

      describe("when call cancelWeightUpdates()", function () {
        testCancelWeightUpdates();
      });

      describe("when finalize", function () {
        describe("should be reverted to call functions when finalized", async () => {
          testFunctionCallsWhenFinalized();
        });

        describe("initialize Vault", function () {
          testFinalize();
        });
      });

      describe("when enable/disable trading", function () {
        describe("with enableTradingRiskingArbitrage function", function () {
          testEnableTradingRiskingArbitrage();
        });

        describe("with enableTradingWithWeights function", function () {
          testEnableTradingWithWeights();
        });

        describe("with enableTradingWithOraclePrice function", function () {
          testEnableTradingWithOraclePrice();
        });
      });
    });

    describe("Multicall", function () {
      testMulticall();
    });

    describe("Get Spot Prices", function () {
      testGetSpotPrices();
    });

    describe("Sweep", function () {
      testSweep();
    });

    describe("Claim Manager Fees", function () {
      testClaimManagerFees();
    });

    describe("Update Elements", function () {
      describe("Update Manager", function () {
        testSetManager();
      });

      describe("Enable/Disable Oracle", function () {
        testSetOraclesEnabled();
      });

      describe("Disable Trading", function () {
        testDisableTrading();
      });

      describe("Set Swap Fee", function () {
        testSetSwapFee();
      });

      describe("Ownership", function () {
        testOwnership();
      });
    });
  });
}
