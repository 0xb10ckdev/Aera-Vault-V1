// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "./IBMerkleOrchard.sol";

/// @title Interface for protocol that owns treasury.
interface IProtocolAPI {
    /// @notice Initialize Vault with first deposit.
    /// @dev Initial deposit must be performed before
    ///      calling withdraw() or deposit() functions.
    ///      It enables trading, so weights and balances should be in line
    ///      with market spot prices, otherwise there is a significant risk
    ///      of arbitrage.
    ///      This is checked by Balancer in internal transactions:
    ///       If token amount is not zero when join pool.
    /// @param amounts Deposit amount of tokens.
    function initialDeposit(uint256[] memory amounts) external;

    /// @notice Deposit tokens into vault.
    /// @dev It calls updateWeights() function
    ///      which cancels current active weights change schedule.
    /// @param amounts Token amounts to deposit.
    function deposit(uint256[] memory amounts) external;

    /// @notice Deposit tokens into vault.
    /// @dev It calls updateWeights() function
    ///      which cancels current active weights change schedule.
    ///      It reverts if balances were updated in the current block.
    /// @param amounts Token amounts to deposit.
    function depositIfBalanceUnchanged(uint256[] memory amounts) external;

    /// @notice Withdraw tokens up to requested amounts.
    /// @dev It calls updateWeights() function
    ///      which cancels current active weights change schedule.
    /// @param amounts Requested token amounts.
    function withdraw(uint256[] memory amounts) external;

    /// @notice Withdraw tokens up to requested amounts.
    /// @dev It calls updateWeights() function
    ///      which cancels current active weights change schedule.
    ///      It reverts if balances were updated in the current block.
    /// @param amounts Requested token amounts.
    function withdrawIfBalanceUnchanged(uint256[] memory amounts) external;

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
    /// @dev These are checked by Balancer in internal transactions:
    ///       If weight length and token length match.
    ///       If total sum of weights is one.
    ///       If weight is greater than minimum.
    /// @param weights New weights of tokens.
    function enableTradingWithWeights(uint256[] memory weights) external;

    /// @notice Disable swap.
    function disableTrading() external;

    /// @notice Claim Balancer rewards.
    /// @dev It calls claimDistributions() function of Balancer MerkleOrchard.
    ///      Once this function is called, the tokens will be transferred to
    ///      the Vault and it can be distributed via sweep function.
    /// @param claims An array of the claim structs that describes the claim.
    /// @param tokens An array of the set of all tokens to be claimed.
    function claimRewards(
        IBMerkleOrchard.Claim[] memory claims,
        IERC20[] memory tokens
    ) external;

    /// @notice Offer ownership to another address
    /// @dev It disables immediate transfer of ownership
    function transferOwnership(address newOwner) external;

    /// @notice Cancel current pending ownership transfer
    function cancelOwnershipTransfer() external;
}
