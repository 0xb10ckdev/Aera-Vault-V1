import { baseContext } from "../../shared/contexts";
import { integrationTestPutOptionsVault } from "./put-options-vault/setup";

baseContext("Put Options Vault Integration Tests", function () {
  integrationTestPutOptionsVault();
});
