// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../v1/MammonVaultV1.sol";
import "./OracleStorage.sol";
import "./dependencies/chainlink/interfaces/AggregatorV2V3Interface.sol";
import "./interfaces/IProtocolAPIV2.sol";
import "./interfaces/IManagerAPIV2.sol";

/// @title Risk-managed treasury vault.
/// @notice Managed n-asset vault that supports withdrawals
///         in line with a pre-defined validator contract.
/// @dev Vault owner is the asset owner.
contract AeraVaultV2 is
    MammonVaultV1,
    OracleStorage,
    IProtocolAPIV2,
    IManagerAPIV2
{
    /// STORAGE ///

    /// @notice Minimum reliable vault TVL. It will be measured in base token terms.
    uint256 private constant MIN_RELIABLE_VAULT_VALUE = 0;

    /// @notice Minimum significant deposit value. It will be measured in base token terms.
    uint256 private constant MIN_SIGNIFICANT_DEPOSIT_VALUE = 0;

    /// @notice Maximum oracle spot price divergence.
    uint256 private constant MAX_ORACLE_SPOT_DIVERGENCE = 0;

    /// @notice Maximum update deplay of oracles.
    uint256 private constant MAX_ORACLE_DELAY = 0;

    /// @notice If it's enabled to use oracle prices.
    bool public oraclesEnabled = true;

    /// EVENTS ///

    /// @notice Emitted when enableTradingWithOraclePrice is called.
    /// @param prices Used oracle prices.
    /// @param weights Updated weights of tokens.
    event UpdateWeightsWithOraclePrice(uint256[] prices, uint256[] weights);

    /// @notice Emitted when using oracle prices is enabled/disabled.
    /// @param enabled New state of using oracle prices.
    event SetOraclesEnabled(bool enabled);

    /// ERRORS ///
    error Aera__OraclePriceIsInvalid(uint256 index, int256 actual);
    error Aera__OracleSpotPriceDivergenceExceedsMaximum(
        uint256 actual,
        uint256 max
    );
    error Aera__OracleIsDeplayedBeyondMaximum(
        uint256 index,
        uint256 actual,
        uint256 max
    );
    error Aera__OraclesAreDisabled();

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
        MammonVaultV1(vaultParams)
        OracleStorage(oracles, numeraireAssetIndex_, vaultParams.tokens.length)
    {}

    function deposit(TokenValue[] calldata tokenWithAmount)
        external
        override
        nonReentrant
        onlyOwner
        whenInitialized
        whenNotFinalizing
    {
        depositTokens(tokenWithAmount);
    }

    /// @inheritdoc IProtocolAPIV2
    function depositRiskingArbitrage(TokenValue[] calldata tokenWithAmount)
        external
        override
        nonReentrant
        onlyOwner
        whenInitialized
        whenNotFinalizing
    {
        depositTokens(tokenWithAmount);
    }

    /// @inheritdoc IProtocolAPIV2
    // slither-disable-next-line incorrect-equality
    function depositRiskingArbitrageIfBalanceUnchanged(
        TokenValue[] calldata tokenWithAmount
    )
        external
        override
        nonReentrant
        onlyOwner
        whenInitialized
        whenNotFinalizing
    {
        (, , uint256 lastChangeBlock) = getTokensData();

        if (lastChangeBlock == block.number) {
            revert Mammon__BalanceChangedInCurrentBlock();
        }

        depositTokens(tokenWithAmount);
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
        checkOracleStatus();

        uint256[] memory oracleUnits = getOracleUnits();
        uint256[] memory holdings = getHoldings();
        uint256[] memory prices = getOraclePrices();
        uint256 numHoldings = holdings.length;
        uint256[] memory weights = new uint256[](numHoldings);
        uint256 weightSum = ONE;
        uint256 holdingsRatio;
        uint256 numeraireAssetHolding = holdings[numeraireAssetIndex];
        weights[numeraireAssetIndex] = ONE;

        for (uint256 i = 0; i < numHoldings; i++) {
            if (i == numeraireAssetIndex) {
                continue;
            }

            // slither-disable-next-line divide-before-multiply
            holdingsRatio = (holdings[i] * ONE) / numeraireAssetHolding;
            weights[i] = (holdingsRatio * (oracleUnits[i])) / prices[i];
            weightSum += weights[i];
        }

        updateWeights(weights, weightSum);
        setSwapEnabled(true);

        emit UpdateWeightsWithOraclePrice(prices, pool.getNormalizedWeights());
    }

    /// @inheritdoc IProtocolAPIV2
    function setOraclesEnabled(bool enabled)
        external
        override
        nonReentrant
        onlyOwnerOrManager
    {
        oraclesEnabled = enabled;

        emit SetOraclesEnabled(enabled);
    }

    /// INTERNAL FUNCTIONS ///

    /// @notice Determine best prices for deposits.
    /// @dev Will only be called by deposit.
    /// @param amounts Deposit token amounts.
    /// @return Determined token prices
    function getDeterminedPrices(uint256[] memory amounts)
        internal
        returns (uint256[] memory)
    {
        uint256[] memory holdings = getHoldings();
        uint256[] memory oraclePrices = getOraclePrices();
        uint256[] memory spotPrices = getSpotPrices();

        if (getValue(holdings, spotPrices) < MIN_RELIABLE_VAULT_VALUE) {
            checkOracleStatus();
            return oraclePrices;
        }

        uint256 ratio;

        for (uint256 i = 0; i < holdings.length; i++) {
            ratio = (oraclePrices[i] * ONE) / spotPrices[i];
            if (ratio > MAX_ORACLE_SPOT_DIVERGENCE) {
                revert Aera__OracleSpotPriceDivergenceExceedsMaximum(
                    ratio,
                    MAX_ORACLE_SPOT_DIVERGENCE
                );
            }
            ratio = (spotPrices[i] * ONE) / oraclePrices[i];
            if (ratio > MAX_ORACLE_SPOT_DIVERGENCE) {
                revert Aera__OracleSpotPriceDivergenceExceedsMaximum(
                    ratio,
                    MAX_ORACLE_SPOT_DIVERGENCE
                );
            }
        }

        if (getValue(amounts, spotPrices) < MIN_SIGNIFICANT_DEPOSIT_VALUE) {
            return spotPrices;
        }

        checkOracleStatus();
        return oraclePrices;
    }

    /// @notice Calculate value of token amounts in base token term.
    /// @dev Will only be called by getDeterminedPrices.
    /// @param amounts Token amounts.
    /// @param prices Token prices in base token.
    /// @return Total value in base token term.
    function getValue(uint256[] memory amounts, uint256[] memory prices)
        internal
        returns (uint256)
    {
        uint256[] memory amounts = getHoldings();
        uint256 value;

        for (uint256 i = 0; i < amounts.length; i++) {
            if (i == numeraireAssetIndex) {
                value += amounts[i];
                continue;
            }

            // slither-disable-next-line divide-before-multiply
            value += ((amounts[i] * prices[i]) / ONE);
        }

        return value;
    }

    /// @notice Calculate spot prices of tokens vs base token.
    /// @dev Will only be called by getDeterminedPrices.
    /// @return Spot prices of tokens vs base token.
    function getSpotPrices() internal view returns (uint256[] memory) {
        uint256[] memory holdings = getHoldings();
        uint256[] memory weights = pool.getNormalizedWeights();
        uint256 numHoldings = holdings.length;
        uint256[] memory prices = new uint256[](numHoldings);
        uint256 swapFee = pool.getSwapFeePercentage();
        uint256 numeraireAssetHolding = holdings[numeraireAssetIndex];
        uint256 numeraireAssetWeight = weights[numeraireAssetIndex];

        for (uint256 i = 0; i < numHoldings; i++) {
            if (i == numeraireAssetIndex) {
                prices[i] = ONE;
                continue;
            }
            prices[i] = calcSpotPrice(
                holdings[i],
                weights[i],
                numeraireAssetHolding,
                numeraireAssetWeight,
                swapFee
            );
        }

        return prices;
    }

    /// @notice Calculate spot price from balances and weights.
    /// @dev Will only be called by getSpotPrices().
    /// @return Spot price from balances and weights.
    function calcSpotPrice(
        uint256 tokenBalanceIn,
        uint256 tokenWeightIn,
        uint256 tokenBalanceOut,
        uint256 tokenWeightOut,
        uint256 swapFee
    ) internal pure returns (uint256) {
        uint256 numer = (tokenBalanceIn * ONE) / tokenWeightIn;
        uint256 denom = (tokenBalanceOut * ONE) / tokenWeightOut;
        uint256 ratio = (numer * ONE) / denom;
        uint256 scale = (ONE * ONE) / (ONE - swapFee);
        return (ratio * scale) / ONE;
    }

    /// @notice Get oracle prices.
    /// @dev Will only be called by getDeterminedPrices and enableTradingWithOraclePrice.
    /// @return Oracle prices.
    function getOraclePrices() internal returns (uint256[] memory) {
        AggregatorV2V3Interface[] memory oracles = getOracles();
        uint256[] memory prices = new uint256[](numOracles);
        int256 latestAnswer;

        for (uint256 i = 0; i < numOracles; i++) {
            if (i == numeraireAssetIndex) {
                continue;
            }

            latestAnswer = oracles[i].latestAnswer();

            // Check if the price from the Oracle is valid as Aave does
            if (latestAnswer <= 0) {
                revert Aera__OraclePriceIsInvalid(i, latestAnswer);
            }

            prices[i] = uint256(latestAnswer);
        }

        return prices;
    }

    /// @notice Check oracle status.
    /// @dev Will only be called by getDeterminedPrices.
    ///      It checks if oracles are updated recently or oracles are enabled to use.
    function checkOracleStatus() internal {
        if (!oraclesEnabled) {
            revert Aera__OraclesAreDisabled();
        }

        AggregatorV2V3Interface[] memory oracles = getOracles();
        uint256 updatedAt;
        uint256 delay;

        for (uint256 i = 0; i < numOracles; i++) {
            if (i == numeraireAssetIndex) {
                continue;
            }

            (, , , updatedAt, ) = oracles[i].latestRoundData();

            delay = block.timestamp - updatedAt;
            if (delay > MAX_ORACLE_DELAY) {
                revert Aera__OracleIsDeplayedBeyondMaximum(
                    i,
                    delay,
                    MAX_ORACLE_DELAY
                );
            }
        }
    }
}
