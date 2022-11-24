import { ethers } from "hardhat";
import {
  BalancerVaultMock__factory,
  IERC20,
  ERC4626Mock,
  BaseManagedPoolFactory__factory,
  ManagedPoolFactory__factory,
  AeraVaultV2Mock__factory,
  WithdrawalValidatorMock__factory,
  OracleMock,
} from "../../../typechain";
import {
  MAX_MANAGEMENT_FEE,
  MIN_SWAP_FEE,
  ONE,
  ZERO_ADDRESS,
  MIN_FEE_DURATION,
  MIN_RELIABLE_VAULT_VALUE,
  MIN_SIGNIFICANT_DEPOSIT_VALUE,
  MAX_ORACLE_SPOT_DIVERGENCE,
  MAX_ORACLE_DELAY,
} from "../constants";
import { setupTokens, setupOracles } from "../fixtures";
import { valueArray } from "../utils";
import { test } from "../common/test";

const initialize = async () => {
  const snapshot = await ethers.provider.send("evm_snapshot", []);

  const { admin, manager, user } = await ethers.getNamedSigners();
  const { tokens, sortedTokens, unsortedTokens } = await setupTokens();
  const oracles = await setupOracles();
  const oracleAddresses = oracles.map((oracle: OracleMock) => oracle.address);
  oracleAddresses[0] = ZERO_ADDRESS;

  const validatorMock =
    await ethers.getContractFactory<WithdrawalValidatorMock__factory>(
      "WithdrawalValidatorMock",
    );

  const validator = await validatorMock.connect(admin).deploy(tokens.length);

  const bVaultContract =
    await ethers.getContractFactory<BalancerVaultMock__factory>(
      "BalancerVaultMock",
    );
  const bVault = await bVaultContract.connect(admin).deploy(ZERO_ADDRESS);

  const baseManagedPoolFactoryContract =
    await ethers.getContractFactory<BaseManagedPoolFactory__factory>(
      "BaseManagedPoolFactory",
    );
  const baseManagedPoolFactory = await baseManagedPoolFactoryContract
    .connect(admin)
    .deploy(bVault.address);

  const managedPoolFactoryContract =
    await ethers.getContractFactory<ManagedPoolFactory__factory>(
      "ManagedPoolFactory",
    );
  const factory = await managedPoolFactoryContract
    .connect(admin)
    .deploy(baseManagedPoolFactory.address);

  const validWeights = valueArray(ONE.div(tokens.length), tokens.length);

  const vaultFactory =
    await ethers.getContractFactory<AeraVaultV2Mock__factory>(
      "AeraVaultV2Mock",
    );

  const vault = await vaultFactory.connect(admin).deploy({
    factory: factory.address,
    name: "Test",
    symbol: "TEST",
    tokens: sortedTokens,
    weights: validWeights,
    oracles: oracleAddresses,
    numeraireAssetIndex: 0,
    swapFeePercentage: MIN_SWAP_FEE,
    manager: manager.address,
    validator: validator.address,
    minReliableVaultValue: MIN_RELIABLE_VAULT_VALUE,
    minSignificantDepositValue: MIN_SIGNIFICANT_DEPOSIT_VALUE,
    maxOracleSpotDivergence: MAX_ORACLE_SPOT_DIVERGENCE,
    maxOracleDelay: MAX_ORACLE_DELAY,
    minFeeDuration: MIN_FEE_DURATION,
    managementFee: MAX_MANAGEMENT_FEE,
    merkleOrchard: ZERO_ADDRESS,
    description: "Test vault description",
  });

  return {
    admin,
    manager,
    user,
    vault,
    validator,
    tokens,
    sortedTokens,
    oracles,
    unsortedTokens,
    snapshot,
  };
};

describe("Aera Vault V2 Mainnet Functionality", function () {
  test(initialize);
});
