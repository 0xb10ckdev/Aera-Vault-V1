// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

/// @title Interface for protocol that owns treasury.
interface IProtocolAPI {
    /// @notice Initialize Vault with first deposit.
    /// @dev Initial deposit must be performed before
    ///      calling withdraw() or deposit() functions.
    /// @param amount0 Deposited amount of first token.
    /// @param amount1 Deposited amount of second token.
    /// @param weight0 Initial weight of first token.
    /// @param weight1 Initial weight of second token.
    function initialDeposit(
        uint256 amount0,
        uint256 amount1,
        uint256 weight0,
        uint256 weight1
    ) external;

    /// @notice Deposit tokens into vault.
    /// @param amount0 Amount to deposit of first token.
    /// @param amount1 Amount to deposit of second token.
    function deposit(uint256 amount0, uint256 amount1) external;

    /// @notice Withdraw tokens up to requested amounts.
    /// @param amount0 Requested amount of first token.
    /// @param amount1 Requested amount of second token.
    function withdraw(uint256 amount0, uint256 amount1) external;

    /// @notice Initiate vault destruction and return all funds to treasury owner.
    function initializeFinalization() external;

    /// @notice Destroy vault and returns all funds to treasury owner.
    function finalize() external;

    /// @notice Change manager.
    function setManager(address newManager) external;

    /// @notice Withdraw any tokens accidentally sent to vault.
    function sweep(address token, uint256 amount) external;
}
