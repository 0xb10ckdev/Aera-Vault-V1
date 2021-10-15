// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

/// @notice Represents the withdrawal conditions for a vault.
/// @dev Should be extended by vault owner or manager, deployed and attached
/// to a vault instance.
interface IWithdrawalValidator {
    /// @notice Determines how much of each token could be withdrawn under
    /// current conditions.
    /// @return token1Amount, token2Amount The quantity of each token that
    /// can be withdrawn from the vault.
    /// @dev Token quantity value should be interpreted with the same
    /// decimals as the token ERC20 balance.
    function allowance() external view returns (uint256, uint256);
}
