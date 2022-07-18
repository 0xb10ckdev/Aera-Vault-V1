// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../v1/MammonVaultV1.sol";
import "./dependencies/chainlink/interfaces/AggregatorV2V3Interface.sol";
import "./interfaces/IProtocolAPIV2.sol";

/// @title Risk-managed treasury vault.
/// @notice Managed n-asset vault that supports withdrawals
///         in line with a pre-defined validator contract.
/// @dev Vault owner is the asset owner.
contract AeraVaultV2 is MammonVaultV1, IProtocolAPIV2 {
    /// STORAGE ///

    // slither-disable-next-line shadowing-state
    uint256 private constant ONE = 10**18;

    /// @dev Oracle addresses.
    AggregatorV2V3Interface[] public oracles;

    /// @dev Index of asset to be used as base token for oracles.
    uint256 public immutable numeraireAssetIndex;

    /// EVENTS ///

    /// @notice Emitted when enableTradingWithOraclePrice is called.
    /// @param weights Updated weights of tokens.
    event UpdateWeightsWithOraclePrice(uint256[] weights);

    /// ERRORS ///

    error Aera__OracleLengthIsNotSame(
        uint256 tokenLength,
        uint256 oracleLength
    );
    error Aera__NumeraireAssetIndexExceedTokenLength(
        uint256 tokenLength,
        uint256 index
    );
    error Aera__OracleIsZeroAddress(uint256 index);
    error Aera__OraclePriceIsInvalid(uint256 index, int256 actual);

    /// FUNCTIONS ///

    /// @notice Initialize the contract by deploying new Balancer pool using the provided factory.
    /// @dev Tokens should be unique. Validator should conform to interface.
    ///      These are checked by Balancer in internal transactions:
    ///       If tokens are sorted in ascending order.
    ///       If swapFeePercentage is greater than minimum and less than maximum.
    ///       If total sum of weights is one.
    /// @param vaultParams Struct vault parameter.
    /// @param oracles_ Chainlink oracle addresses.
    /// @param numeraireAssetIndex_ Index of base token for oracles.
    constructor(
        NewVaultParams memory vaultParams,
        AggregatorV2V3Interface[] memory oracles_,
        uint256 numeraireAssetIndex_
    ) MammonVaultV1(vaultParams) {
        uint256 numTokens = vaultParams.tokens.length;
        if (numTokens != oracles_.length) {
            revert Aera__OracleLengthIsNotSame(numTokens, oracles_.length);
        }
        if (numeraireAssetIndex_ >= numTokens) {
            revert Aera__NumeraireAssetIndexExceedTokenLength(
                numTokens,
                numeraireAssetIndex_
            );
        }

        // Check if oracle address is zero address.
        // Oracle for base token could be specified as zero address.
        for (uint256 i = 0; i < numTokens; i++) {
            if (
                i != numeraireAssetIndex_ && address(oracles_[i]) == address(0)
            ) {
                revert Aera__OracleIsZeroAddress(i);
            }
        }

        oracles = oracles_;
        numeraireAssetIndex = numeraireAssetIndex_;
    }

    /// @inheritdoc IProtocolAPIV2
    // slither-disable-next-line calls-loop
    function enableTradingWithOraclePrice()
        external
        override
        nonReentrant
        onlyManager
        whenInitialized
    {
        uint256[] memory holdings = getHoldings();
        uint256 numHoldings = holdings.length;
        uint256[] memory weights = new uint256[](numHoldings);
        uint256 weightSum = ONE;
        int256 latestAnswer;
        uint256 holdingsRatio;
        weights[numeraireAssetIndex] = ONE;

        for (uint256 i = 0; i < numHoldings; i++) {
            if (i != numeraireAssetIndex) {
                latestAnswer = oracles[i].latestAnswer();

                // Check if the price from the Oracle is valid as Aave does
                // https://docs.aave.com/developers/v/1.0/developing-on-aave/the-protocol/price-oracle
                // https://github.com/aave/aave-protocol/blob/4b4545fb583fd4f400507b10f3c3114f45b8a037/
                // contracts/misc/ChainlinkProxyPriceProvider.sol#L77
                if (latestAnswer <= 0) {
                    revert Aera__OraclePriceIsInvalid(i, latestAnswer);
                }

                // slither-disable-next-line divide-before-multiply
                holdingsRatio =
                    (holdings[i] * ONE) /
                    holdings[numeraireAssetIndex];
                weights[i] =
                    (holdingsRatio * (10**oracles[i].decimals())) /
                    uint256(latestAnswer);
                weightSum += weights[i];
            }
        }

        updateWeights(weights, weightSum);
        setSwapEnabled(true);

        emit UpdateWeightsWithOraclePrice(pool.getNormalizedWeights());
    }
}
