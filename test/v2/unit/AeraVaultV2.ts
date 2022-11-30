import { ethers } from "hardhat";
import { setupVaultWithBalancerVaultMock } from "../fixtures";
import { testAeraVaultV2 } from "../functions";

describe("Unit Test", function () {
  let snapshot: unknown;

  beforeEach(async function () {
    snapshot = await ethers.provider.send("evm_snapshot", []);

    const deployedData = await setupVaultWithBalancerVaultMock();

    this.admin = deployedData.admin;
    this.manager = deployedData.manager;
    this.user = deployedData.user;
    this.vault = deployedData.vault;
    this.validator = deployedData.validator;
    this.factory = deployedData.factory;
    this.poolTokens = deployedData.poolTokens;
    this.tokens = deployedData.tokens;
    this.tokenAddresses = deployedData.tokenAddresses;
    this.yieldTokens = deployedData.yieldTokens;
    this.underlyingIndexes = deployedData.underlyingIndexes;
    this.sortedTokens = deployedData.sortedTokens;
    this.oracles = deployedData.oracles;
    this.oracleAddresses = deployedData.oracleAddresses;
    this.unsortedTokens = deployedData.unsortedTokens;
    this.isForkTest = false;
  });

  afterEach(async function () {
    await ethers.provider.send("evm_revert", [snapshot]);
  });

  testAeraVaultV2();
});
