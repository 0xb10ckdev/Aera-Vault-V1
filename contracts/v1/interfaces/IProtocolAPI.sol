// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

/// @title Interface for protocol that owns treasury.
interface IProtocolAPI {
    /// @notice Initialize Vault with first deposit.
    /// @dev Initial deposit must be performed before
    ///      calling withdraw() or deposit() functions.
    ///      It enables trading, so weights and balances should be in line
    ///      with market spot prices, otherwise there is a significant risk
    ///      of arbitrage.
    /// @param amounts Deposit amount of tokens.
    function initialDeposit(uint256[] memory amounts) external;

    /// @notice Deposit tokens into vault.
    /// @dev It calls updateWeights() function
    ///      which cancels current active weights change schedule.
    /// @param amounts Token amounts to deposit.
    function deposit(uint256[] memory amounts) external;

    /// @notice Withdraw tokens up to requested amounts.
    /// @dev It calls updateWeights() function
    ///      which cancels current active weights change schedule.
    /// @param amounts Requested token amounts.
    function withdraw(uint256[] memory amounts) external;

    /// @notice Initiate vault destruction and return all funds to treasury owner.
    function initiateFinalization() external;

    /// @notice Destroy vault and returns all funds to treasury owner.
    function finalize() external;

    /// @notice Change manager.
    function setManager(address newManager) external;

    /// @notice Withdraw any tokens accidentally sent to vault.
    function sweep(address token, uint256 amount) external;

    /// @notice Enable swap with current weights.
    function enableTradingRiskingArbitrage() external;

    /// @notice Enable swap with updating weights.
    /// @param weights New weights of tokens.
    function enableTradingWithWeights(uint256[] memory weights) external;

    /// @notice Disable swap.
    function disableTrading() external;

    /// @notice Offer ownership to another address
    /// @dev It disables immediate transfer of ownership
    function transferOwnership(address newOwner) external;

    /// @notice Cancel current pending ownership transfer
    function cancelOwnershipTransfer() external;
}
