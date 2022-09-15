// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "./IProtocolAPI.sol";

/// @title Interface for protocol that owns treasury.
interface IProtocolAPIV2 {
    /// @notice Initialize Vault with first deposit.
    /// @dev Initial deposit must be performed before
    ///      calling withdraw() or deposit() functions.
    ///      It enables trading, so weights and balances should be in line
    ///      with market spot prices, otherwise there is a significant risk
    ///      of arbitrage.
    ///      This is checked by Balancer in internal transactions:
    ///       If token amount is not zero when join pool.
    /// @param tokenWithAmount Deposit tokens with amount.
    /// @param tokenWithWeight Weight of tokens in the vault.
    function initialDeposit(
        IProtocolAPI.TokenValue[] memory tokenWithAmount,
        IProtocolAPI.TokenValue[] memory tokenWithWeight
    ) external;

    /// @notice Deposit tokens into vault.
    /// @dev It calls updateWeights() function
    ///      which cancels current active weights change schedule.
    /// @param tokenWithAmount Deposit tokens with amount.
    function depositRiskingArbitrage(
        IProtocolAPI.TokenValue[] memory tokenWithAmount
    ) external;

    /// @notice Deposit tokens into vault.
    /// @dev It calls updateWeights() function
    ///      which cancels current active weights change schedule.
    ///      It reverts if balances were updated in the current block.
    /// @param tokenWithAmount Deposit token with amount.
    function depositRiskingArbitrageIfBalanceUnchanged(
        IProtocolAPI.TokenValue[] memory tokenWithAmount
    ) external;

    /// @notice Enable swap with oracle prices.
    function enableTradingWithOraclePrice() external;

    /// @notice Enable or disable using oracle prices.
    function setOraclesEnabled(bool enabled) external;
}
