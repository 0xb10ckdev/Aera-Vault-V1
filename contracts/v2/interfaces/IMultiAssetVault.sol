// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

/// @title Multi-asset vault interface.
interface IMultiAssetVault {
    /// @notice Balance of token with given index.
    /// @return Current token balance in Balancer Pool and Aera Vault.
    function holding(uint256 index) external view returns (uint256);

    /// @notice Return balance of pool tokens and yield tokens.
    /// @return Current token balances.
    function getHoldings() external view returns (uint256[] memory);
}
