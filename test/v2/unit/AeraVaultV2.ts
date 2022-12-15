import { baseContext } from "../../shared/contexts";
import { setupVaultWithBalancerVaultMock } from "../fixtures";
import { testAeraVaultV2 } from "../functions/vault";

baseContext("Unit Test", function () {
  beforeEach(async function () {
    const {
      vault,
      validator,
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
    } = await this.loadFixture(setupVaultWithBalancerVaultMock);

    this.vault = vault;
    this.validator = validator;
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
    this.isForkTest = false;
  });

  testAeraVaultV2();
});
