import { baseContext } from "../../shared/contexts";
import { integrationTestPremiaOptionsPricer } from "./premia-options-pricer/setup";

baseContext("Premia Options Pricer Integration Tests", function () {
  integrationTestPremiaOptionsPricer();
});
