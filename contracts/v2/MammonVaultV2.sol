// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../v1/MammonVaultV1.sol";
import "./dependencies/chainlink/interfaces/AggregatorV2V3Interface.sol";
import "./interfaces/IProtocolAPIV2.sol";

/// @title Risk-managed treasury vault.
/// @notice Managed n-asset vault that supports withdrawals
///         in line with a pre-defined validator contract.
/// @dev Vault owner is the asset owner.
contract MammonVaultV2 is MammonVaultV1, IProtocolAPIV2 {
    /// STORAGE ///

    // slither-disable-next-line shadowing-state
    uint256 private constant ONE = 10**18;

    /// @dev Oracle addresses.
    AggregatorV2V3Interface[] public oracles;

    /// ERRORS ///

    error Mammon__OracleLengthIsNotSame(
        uint256 tokenLength,
        uint256 oracleLength
    );
    error Mammon__OracleIsZeroAddress(uint256 index);

    /// FUNCTIONS ///

    /// @notice Initialize the contract by deploying new Balancer pool using the provided factory.
    /// @dev Tokens should be unique. Validator should conform to interface.
    ///      These are checked by Balancer in internal transactions:
    ///       If tokens are sorted in ascending order.
    ///       If swapFeePercentage is greater than minimum and less than maximum.
    ///       If total sum of weights is one.
    /// @param vaultParams Struct vault parameter.
    /// @param oracles_ Chainlink oracle addresses.
    constructor(
        NewVaultParams memory vaultParams,
        AggregatorV2V3Interface[] memory oracles_
    ) MammonVaultV1(vaultParams) {
        uint256 numTokens = vaultParams.tokens.length;
        if (numTokens != oracles_.length) {
            revert Mammon__OracleLengthIsNotSame(numTokens, oracles_.length);
        }

        for (uint256 i = 1; i < numTokens; i++) {
            if (address(oracles_[i]) == address(0)) {
                revert Mammon__OracleIsZeroAddress(i);
            }
        }

        oracles = oracles_;
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
        uint256[] memory weights = new uint256[](holdings.length);
        uint256 weightSum = ONE;
        int256 latestAnswer;
        weights[0] = ONE;

        for (uint256 i = 1; i < holdings.length; i++) {
            uint256 latestPrice;
            latestAnswer = oracles[i].latestAnswer();
            if (latestAnswer > 0) {
                latestPrice = uint256(latestAnswer);
            }
            weights[i] =
                (ONE * holdings[i] * (10**oracles[i].decimals())) /
                holdings[0] /
                latestPrice;
            weightSum += weights[i];
        }

        updateWeights(weights, weightSum);
        setSwapEnabled(true);
    }
}
