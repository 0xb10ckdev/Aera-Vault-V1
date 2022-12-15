import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import hre, { deployments, ethers } from "hardhat";
import { getConfig } from "../../../../scripts/config";
import {
  ERC4626Mock,
  IERC20,
  ManagedPoolFactory,
  OracleMock,
  WithdrawalValidatorMock,
  WithdrawalValidatorMock__factory,
} from "../../../../typechain";
import {
  BALANCER_ERRORS,
  MAX_MANAGEMENT_FEE,
  MAX_ORACLE_DELAY,
  MAX_ORACLE_SPOT_DIVERGENCE,
  MAX_SWAP_FEE,
  MIN_FEE_DURATION,
  MIN_RELIABLE_VAULT_VALUE,
  MIN_SIGNIFICANT_DEPOSIT_VALUE,
  MIN_SWAP_FEE,
  MIN_WEIGHT,
  ONE,
  ZERO_ADDRESS,
} from "../../constants";
import {
  setupOracles,
  setupTokens,
  setupYieldBearingAssets,
} from "../../fixtures";
import {
  deployFactory,
  deployVault,
  toWei,
  valueArray,
  VaultParams,
} from "../../utils";

export function testDeployment(): void {
  let admin: SignerWithAddress;
  let manager: SignerWithAddress;
  let validator: WithdrawalValidatorMock;
  let factory: ManagedPoolFactory;
  let poolTokens: IERC20[];
  let tokens: IERC20[];
  let yieldTokens: ERC4626Mock[];
  let sortedTokens: string[];
  let unsortedTokens: string[];
  let oracles: OracleMock[];
  let oracleAddress: string[];
  let snapshot: unknown;
  let validWeights: string[];
  let validParams: VaultParams;

  describe("should be reverted to deploy vault", async function () {
    before(async function () {
      snapshot = await ethers.provider.send("evm_snapshot", []);
      ({ admin, manager } = await ethers.getNamedSigners());

      ({
        tokens: poolTokens,
        sortedTokens,
        unsortedTokens,
      } = await setupTokens());
      yieldTokens = await setupYieldBearingAssets(sortedTokens.slice(0, 2));
      oracles = await setupOracles();

      tokens = [...poolTokens, ...yieldTokens];
      oracleAddress = oracles.map((oracle: OracleMock) => oracle.address);
      oracleAddress[0] = ZERO_ADDRESS;
      validWeights = valueArray(ONE.div(poolTokens.length), poolTokens.length);
      await deployments.deploy("Validator", {
        contract: "WithdrawalValidatorMock",
        args: [tokens.length],
        from: admin.address,
        log: true,
      });
      validator = WithdrawalValidatorMock__factory.connect(
        (await deployments.get("Validator")).address,
        admin,
      );
      await deployments.deploy("InvalidValidator", {
        contract: "InvalidValidatorMock",
        from: admin.address,
        log: true,
      });
      factory = await deployFactory(admin);
    });

    beforeEach(async function () {
      const config = getConfig(hre.network.config.chainId || 1);

      validParams = {
        signer: admin,
        factory: factory.address,
        name: "Test",
        symbol: "TEST",
        poolTokens: sortedTokens,
        weights: validWeights,
        oracles: oracleAddress,
        yieldTokens: yieldTokens.map((token, index) => ({
          token: token.address,
          underlyingIndex: index,
        })),
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
        merkleOrchard: config.merkleOrchard,
        description: "Test Vault",
      };
    });

    after(async function () {
      await ethers.provider.send("evm_revert", [snapshot]);
    });

    it("when token and weight length is not same", async function () {
      validParams.weights = [...validWeights, validWeights[0]];
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__ValueLengthIsNotSame",
      );
    });

    it("when token and oracle length is not same", async function () {
      validParams.oracles = [...oracleAddress, oracleAddress[0]];
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__OracleLengthIsNotSame",
      );
    });

    it("when numeraire asset index exceeds token length", async function () {
      validParams.numeraireAssetIndex = poolTokens.length;
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__NumeraireAssetIndexExceedsTokenLength",
      );
    });

    it("when oracle is zero address", async function () {
      validParams.oracles = [...oracleAddress.slice(0, -1), ZERO_ADDRESS];
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__OracleIsZeroAddress",
      );
    });

    it("when numeraire oracle is not zero address", async function () {
      validParams.oracles = [oracles[0].address, ...oracleAddress.slice(1)];
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__NumeraireOracleIsNotZeroAddress",
      );
    });

    it("when management fee is greater than maximum", async function () {
      validParams.managementFee = MAX_MANAGEMENT_FEE.add(1);
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__ManagementFeeIsAboveMax",
      );
    });

    it("when minimum fee duration is zero", async function () {
      validParams.minFeeDuration = "0";
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__MinFeeDurationIsZero",
      );
    });

    it("when minimum reliable vault value is zero", async function () {
      validParams.minReliableVaultValue = toWei(0);
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__MinReliableVaultValueIsZero",
      );
    });

    it("when minimum significant vault value is zero", async function () {
      validParams.minSignificantDepositValue = toWei(0);
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__MinSignificantDepositValueIsZero",
      );
    });

    it("when maximum oracle spot divergence is zero", async function () {
      validParams.maxOracleSpotDivergence = toWei(0);
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__MaxOracleSpotDivergenceIsZero",
      );
    });

    it("when maximum oracle delay is zero", async function () {
      validParams.maxOracleDelay = toWei(0);
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__MaxOracleDelayIsZero",
      );
    });

    it("when validator is not valid", async function () {
      validParams.validator = manager.address;
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__ValidatorIsNotValid",
      );

      validParams.validator = (
        await deployments.get("InvalidValidator")
      ).address;
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__ValidatorIsNotValid",
      );
    });

    it("when validator is not matched", async function () {
      const validatorMock =
        await ethers.getContractFactory<WithdrawalValidatorMock__factory>(
          "WithdrawalValidatorMock",
        );
      const mismatchedValidator = await validatorMock
        .connect(admin)
        .deploy(poolTokens.length - 1);
      validParams.validator = mismatchedValidator.address;

      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__ValidatorIsNotMatched",
      );
    });

    it("when token is not sorted in ascending order", async function () {
      const yieldTokensWithUnsortedTokens = await setupYieldBearingAssets(
        unsortedTokens.slice(0, 2),
      );
      validParams.poolTokens = unsortedTokens;
      validParams.yieldTokens = yieldTokensWithUnsortedTokens.map(
        (token, index) => ({
          token: token.address,
          underlyingIndex: index,
        }),
      );

      await expect(deployVault(validParams)).to.be.revertedWith(
        BALANCER_ERRORS.UNSORTED_ARRAY,
      );
    });

    it("when token is duplicated", async function () {
      validParams.poolTokens = [sortedTokens[0], ...sortedTokens.slice(0, -1)];
      const yieldTokensWithDuplicatedTokens = await setupYieldBearingAssets(
        validParams.poolTokens.slice(0, 2),
      );
      validParams.yieldTokens = yieldTokensWithDuplicatedTokens.map(
        (token, index) => ({
          token: token.address,
          underlyingIndex: index,
        }),
      );

      await expect(deployVault(validParams)).to.be.revertedWith(
        BALANCER_ERRORS.UNSORTED_ARRAY,
      );
    });

    it("when swap fee is greater than maximum", async function () {
      validParams.swapFeePercentage = MAX_SWAP_FEE.add(1);
      await expect(deployVault(validParams)).to.be.revertedWith(
        BALANCER_ERRORS.MAX_SWAP_FEE_PERCENTAGE,
      );
    });

    it("when swap fee is less than minimum", async function () {
      validParams.swapFeePercentage = MIN_SWAP_FEE.sub(1);
      await expect(deployVault(validParams)).to.be.revertedWith(
        BALANCER_ERRORS.MIN_SWAP_FEE_PERCENTAGE,
      );
    });

    it("when total sum of weights is not one", async function () {
      validParams.weights = valueArray(MIN_WEIGHT, poolTokens.length);
      await expect(deployVault(validParams)).to.be.revertedWith(
        BALANCER_ERRORS.NORMALIZED_WEIGHT_INVARIANT,
      );
    });

    it("when manager is zero address", async function () {
      validParams.manager = ZERO_ADDRESS;
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__ManagerIsZeroAddress",
      );
    });

    it("when manager is deployer", async function () {
      validParams.manager = admin.address;
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__ManagerIsOwner",
      );
    });

    it("when description is empty", async function () {
      validParams.description = "";
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Aera__DescriptionIsEmpty",
      );
    });
  });
}
