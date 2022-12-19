import { baseContext } from "../../shared/contexts";
import { setupVaultWithBalancerVaultMock } from "../fixtures";
import { testAeraVaultV2 } from "../functions/vault";

baseContext("Unit Test", function () {
  beforeEach(async function () {
    const {
      vault,
      factory,
      poolTokens,
      tokens,
      tokenAddresses,
      yieldTokens,
      isWithdrawable,
      underlyingIndexes,
      sortedTokens,
      oracles,
      oracleAddresses,
      unsortedTokens,
    } = await this.loadFixture(setupVaultWithBalancerVaultMock);

    this.vault = vault;
    this.factory = factory;
    this.poolTokens = poolTokens;
    this.numPoolTokens = poolTokens.length;
    this.tokens = tokens;
    this.numTokens = tokens.length;
    this.tokenAddresses = tokenAddresses;
    this.yieldTokens = yieldTokens;
    this.numYieldTokens = yieldTokens.length;
    this.isWithdrawable = isWithdrawable;
    this.underlyingIndexes = underlyingIndexes;
    this.sortedTokens = sortedTokens;
    this.oracles = oracles;
    this.oracleAddresses = oracleAddresses;
    this.unsortedTokens = unsortedTokens;
    this.isForkTest = false;
  });

  testAeraVaultV2();
});
