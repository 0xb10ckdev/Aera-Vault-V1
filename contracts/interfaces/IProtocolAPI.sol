// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

/// @title Interface for protocol that owns treasury.
interface IProtocolAPI {
    /// @notice Initialize Vault with first deposit.
    /// @dev Initial deposit must be performed before
    ///      calling withdraw() or deposit() functions.
    /// @param amounts Deposit amount of tokens.
    function initialDeposit(uint256[] memory amounts) external;

    /// @notice Deposit tokens into vault.
    /// @param amounts Token amounts to deposit.
    function deposit(uint256[] memory amounts) external;

    /// @notice Withdraw tokens up to requested amounts.
    /// @param amounts Requested token amounts.
    function withdraw(uint256[] memory amounts) external;

    /// @notice Initiate vault destruction and return all funds to treasury owner.
    function initializeFinalization() external;

    /// @notice Destroy vault and returns all funds to treasury owner.
    function finalize() external;

    /// @notice Change manager.
    function setManager(address newManager) external;

    /// @notice Withdraw any tokens accidentally sent to vault.
    function sweep(address token, uint256 amount) external;

    /// @notice Enable swap.
    /// @param weights New weights of tokens.
    function enableTrading(uint256[] memory weights) external;

    /// @notice Disable swap.
    function disableTrading() external;
}
