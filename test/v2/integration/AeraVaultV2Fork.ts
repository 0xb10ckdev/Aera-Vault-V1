import { baseContext } from "../../shared/contexts";
import { setupVaultWithBalancerVault } from "../fixtures";
import { testAeraVaultV2 } from "../functions/vault";
import { testDeployment } from "../functions/vault/deployment";

describe("Aera Vault V2 Mainnet Deployment", function () {
  testDeployment();
});

baseContext("Integration Test", function () {
  beforeEach(async function () {
    const {
      vault,
      factory,
      poolTokens,
      tokens,
      tokenAddresses,
      yieldTokens,
      underlyingIndexes,
      sortedTokens,
      oracles,
      oracleAddresses,
      unsortedTokens,
    } = await this.loadFixture(setupVaultWithBalancerVault);

    this.vault = vault;
    this.factory = factory;
    this.poolTokens = poolTokens;
    this.tokens = tokens;
    this.tokenAddresses = tokenAddresses;
    this.yieldTokens = yieldTokens;
    this.underlyingIndexes = underlyingIndexes;
    this.sortedTokens = sortedTokens;
    this.oracles = oracles;
    this.oracleAddresses = oracleAddresses;
    this.unsortedTokens = unsortedTokens;
    this.isForkTest = true;
  });

  testAeraVaultV2();
});
