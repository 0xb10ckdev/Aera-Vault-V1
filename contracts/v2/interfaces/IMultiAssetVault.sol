// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

/// @title Multi-asset vault interface.
interface IMultiAssetVault {
    /// @notice Balance of token with given index.
    /// @return holding Current token balance in Balancer Pool and Aera Vault.
    function holding(uint256 index) external view returns (uint256 holding);

    /// @notice Return balance of pool tokens and yield tokens.
    /// @return holdings Current token balances.
    function getHoldings() external view returns (uint256[] memory holdings);
}
