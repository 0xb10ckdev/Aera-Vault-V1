// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../v1/MammonVaultV1.sol";
import "../v1/dependencies/openzeppelin/SafeCast.sol";
import "./dependencies/chainlink/interfaces/AggregatorV2V3Interface.sol";
import "./interfaces/IProtocolAPIV2.sol";

/// @title Risk-managed treasury vault.
/// @notice Managed n-asset vault that supports withdrawals
///         in line with a pre-defined validator contract.
/// @dev Vault owner is the asset owner.
contract MammonVaultV2 is MammonVaultV1, IProtocolAPIV2 {
    using SafeCast for int256;

    struct Assets {
        IERC20[] tokens;
        uint256[] weights;
        AggregatorV2V3Interface[] oracles;
    }

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
    /// @dev First token and second token shouldn't be same. Validator should conform to interface.
    /// @param factory Balancer Managed Pool Factory address.
    /// @param name Name of Pool Token.
    /// @param symbol Symbol of Pool Token.
    /// @param assets Asset data including token addresses, weights and oracle addresses.
    /// @param swapFeePercentage Pool swap fee.
    /// @param manager_ Vault manager address.
    /// @param validator_ Withdrawal validator contract address.
    /// @param noticePeriod_ Notice period (in seconds).
    /// @param managementFee_ Management fee earned proportion per second.
    /// @param description_ Simple vault text description.
    constructor(
        address factory,
        string memory name,
        string memory symbol,
        Assets memory assets,
        uint256 swapFeePercentage,
        address manager_,
        address validator_,
        uint32 noticePeriod_,
        uint256 managementFee_,
        string memory description_
    )
        MammonVaultV1(
            factory,
            name,
            symbol,
            assets.tokens,
            assets.weights,
            swapFeePercentage,
            manager_,
            validator_,
            noticePeriod_,
            managementFee_,
            description_
        )
    {
        if (assets.tokens.length != assets.oracles.length) {
            revert Mammon__OracleLengthIsNotSame(
                assets.tokens.length,
                assets.oracles.length
            );
        }

        for (uint256 i = 1; i < assets.oracles.length; i++) {
            if (address(assets.oracles[i]) == address(0)) {
                revert Mammon__OracleIsZeroAddress(i);
            }
        }

        oracles = assets.oracles;
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
        weights[0] = ONE;

        for (uint256 i = 1; i < holdings.length; i++) {
            uint256 latestPrice = oracles[i].latestAnswer().toUint256();
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
