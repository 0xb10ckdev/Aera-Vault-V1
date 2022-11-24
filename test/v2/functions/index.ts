import { testFunctionCallsWhenNotInitialized } from "../functions/callFunctionsWhenNotInitialized";
import { testFunctionCallsWhenFinalized } from "../functions/callFunctionsWhenFinalized";
import { testInitialDeposit } from "../functions/initialDeposit";
import { testDeposit } from "../functions/deposit";
import { testDepositRiskingArbitrage } from "../functions/depositRiskingArbitrage";
import { testWithdraw } from "../functions/withdraw";
import { testDepositAndWithdraw } from "../functions/depositAndWithdraw";
import { testUpdateWeightsGradually } from "../functions/updateWeightsGradually";
import { testCancelWeightUpdates } from "./cancelWeightUpdates";
import { testFinalize } from "../functions/finalize";
import { testMulticall } from "../functions/multicall";
import { testGetSpotPrices } from "../functions/getSpotPrices";
import { testSweep } from "../functions/sweep";
import { testClaimManagerFees } from "../functions/claimManagerFees";
import { testSetManager } from "../functions/setManager";
import { testSetOraclesEnabled } from "../functions/setOraclesEnabled";
import { testEnableTradingRiskingArbitrage } from "../functions/enableTradingRiskingArbitrage";
import { testEnableTradingWithWeights } from "../functions/enableTradingWithWeights";
import { testEnableTradingWithOraclePrice } from "../functions/enableTradingWithOraclePrice";
import { testDisableTrading } from "../functions/disableTrading";
import { testSetSwapFee } from "../functions/setSwapFee";
import { testOwnership } from "../functions/ownership";
import {
  normalizeWeights,
  tokenValueArray,
  tokenWithValues,
  toUnit,
  toWei,
  valueArray,
} from "../utils";
import { ONE } from "../constants";
import { IERC20 } from "../../../typechain";

export function testAeraVaultV2(): void {
  describe("Aera Vault V2 Mainnet Functionality", function () {
    beforeEach(async function () {
      this.getUserBalances = async (address: string) => {
        const balances = await Promise.all(
          this.tokens.map((token: IERC20) => token.balanceOf(address)),
        );
        return balances;
      };

      this.getManagersFeeTotal = async function () {
        const managersFeeTotal = await Promise.all(
          Array.from(Array(this.tokens.length).keys()).map(index =>
            this.vault.managersFeeTotal(index),
          ),
        );
        return managersFeeTotal;
      };

      this.getState = async (
        managerAddress: string | null = null,
        adminAddress: string | null = null,
      ) => {
        const [holdings, adminBalances, managerBalances] = await Promise.all([
          this.vault.getHoldings(),
          this.getUserBalances(adminAddress || this.admin.address),
          this.getUserBalances(managerAddress || this.manager.address),
        ]);

        return {
          holdings,
          adminBalances,
          managerBalances,
        };
      };
    });

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
        for (let i = 0; i < this.tokens.length; i++) {
          await this.tokens[i].approve(this.vault.address, toWei(100));
        }

        for (let i = 1; i < this.poolTokens.length; i++) {
          await this.oracles[i].setLatestAnswer(toUnit(1, 8));
        }

        await this.vault.initialDeposit(
          tokenValueArray(this.tokenAddresses, ONE, this.tokens.length),
          tokenWithValues(
            this.tokenAddresses,
            normalizeWeights(valueArray(ONE, this.tokens.length)),
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
