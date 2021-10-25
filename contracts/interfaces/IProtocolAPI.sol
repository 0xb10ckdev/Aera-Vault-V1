// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

/// @dev This code is not audited or tested. Please do not use in production.
interface IProtocolAPI {
    /// @notice Initializes the Vault.
    /// @dev Vault initialization must be performed before
    ///      calling withdraw() or deposit() functions. Available only to the owner.
    ///      Vault can be initialized only once.
    /// @param amount0 The amount of the first token.
    /// @param amount1 The amount of the second token.
    /// @param weight0 The weight of the first token.
    /// @param weight1 The weight of the second token.
    function initialDeposit(
        uint256 amount0,
        uint256 amount1,
        uint256 weight0,
        uint256 weight1
    ) external;

    /// @notice Deposit `amounts` of tokens.
    /// @dev Available only to the owner. Available only if the vault is initialized.
    ///      Vault shouldn't be on finalizing.
    /// @param amount0 The amount of the first token.
    /// @param amount1 The amount of the second token.
    function deposit(uint256 amount0, uint256 amount1) external;

    /// @notice Withdraw as much as possible up to each `amount`s of `token`s.
    /// @dev Available only to the owner. Available only if the vault is initialized.
    ///      Vault shouldn't be on finalizing.
    /// @param amount0 The requested amount of the first token.
    /// @param amount1 The requested amount of the second token.
    function withdraw(uint256 amount0, uint256 amount1) external;

    /// @notice Initiate vault destruction and return all funds to treasury owner.
    /// @dev This is practically irreversible.Available only to the owner.
    ///      Available only if the vault is initialized. Vault shouldn't be on finalizing.
    function initializeFinalization() external;

    /// @notice Destroys vault and returns all funds to treasury owner.
    /// @dev Only availble once `initializeFinalization()` is called and
    ///      current timestamp is later than `noticeTimeoutAt`.
    ///      Available only to the owner or the manager.
    function finalize() external;

    /// @notice Changes manager.
    /// @dev Available only to the owner.
    function setManager(address newManager) external;

    /// @notice Withdraw any token which were sent to the Vault accidentally.
    /// @dev Available only to the owner.
    function sweep(address token, uint256 amount) external;
}
