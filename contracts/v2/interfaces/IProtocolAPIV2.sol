// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

/// @title Interface for protocol that owns treasury.
interface IProtocolAPIV2 {
    /// @notice Enable swap with oracle prices.
    function enableTradingWithOraclePrice() external;

    /// @notice Enable or disable using oracle prices.
    function setOraclesEnabled(bool enabled) external;
}
