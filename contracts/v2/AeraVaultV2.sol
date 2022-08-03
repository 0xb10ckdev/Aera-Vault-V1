// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../v1/AeraVaultV1.sol";
import "./OracleStorage.sol";
import "./dependencies/chainlink/interfaces/AggregatorV2V3Interface.sol";
import "./interfaces/IProtocolAPIV2.sol";

/// @title Risk-managed treasury vault.
/// @notice Managed n-asset vault that supports withdrawals
///         in line with a pre-defined validator contract.
/// @dev Vault owner is the asset owner.
contract AeraVaultV2 is AeraVaultV1, OracleStorage, IProtocolAPIV2 {
    /// EVENTS ///

    /// @notice Emitted when enableTradingWithOraclePrice is called.
    /// @param prices Used oracle prices.
    /// @param weights Updated weights of tokens.
    event UpdateWeightsWithOraclePrice(uint256[] prices, uint256[] weights);

    /// FUNCTIONS ///

    /// @notice Initialize the contract by deploying new Balancer pool using the provided factory.
    /// @dev Tokens should be unique. Validator should conform to interface.
    ///      These are checked by Balancer in internal transactions:
    ///       If tokens are sorted in ascending order.
    ///       If swapFeePercentage is greater than minimum and less than maximum.
    ///       If total sum of weights is one.
    /// @param vaultParams Struct vault parameter.
    /// @param oracles Chainlink oracle addresses.
    ///                 All oracles should be in reference to the same asset.
    /// @param numeraireAssetIndex_ Index of base token for oracles.
    // solhint-disable no-empty-blocks
    constructor(
        NewVaultParams memory vaultParams,
        AggregatorV2V3Interface[] memory oracles,
        uint256 numeraireAssetIndex_
    )
        AeraVaultV1(vaultParams)
        OracleStorage(oracles, numeraireAssetIndex_, vaultParams.tokens.length)
    {}

    /// @inheritdoc IProtocolAPIV2
    // slither-disable-next-line calls-loop
    function enableTradingWithOraclePrice()
        external
        override
        nonReentrant
        onlyManager
        whenInitialized
    {
        AggregatorV2V3Interface[] memory oracles = getOracles();
        uint256[] memory oracleUnits = getOracleUnits();
        uint256[] memory holdings = getHoldings();
        uint256 numHoldings = holdings.length;
        uint256[] memory weights = new uint256[](numHoldings);
        uint256[] memory prices = new uint256[](numHoldings);
        uint256 weightSum = ONE;
        int256 latestAnswer;
        uint256 holdingsRatio;
        uint256 numeraireAssetHolding = holdings[numeraireAssetIndex];
        weights[numeraireAssetIndex] = ONE;

        for (uint256 i = 0; i < numHoldings; i++) {
            if (i == numeraireAssetIndex) {
                continue;
            }

            latestAnswer = oracles[i].latestAnswer();

            // Check if the price from the Oracle is valid as Aave does
            if (latestAnswer <= 0) {
                revert Aera__OraclePriceIsInvalid(i, latestAnswer);
            }

            prices[i] = uint256(latestAnswer);
            // slither-disable-next-line divide-before-multiply
            holdingsRatio = (holdings[i] * ONE) / numeraireAssetHolding;
            weights[i] = (holdingsRatio * (oracleUnits[i])) / prices[i];
            weightSum += weights[i];
        }

        updateWeights(weights, weightSum);
        setSwapEnabled(true);

        emit UpdateWeightsWithOraclePrice(prices, pool.getNormalizedWeights());
    }
}
