// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

/// @title Multi-asset vault interface.
interface IMultiAssetVault {
    /// @notice Balance of the token with index
    /// @return Token balance in underlying pool
    function holding(uint256 index) external view returns (uint256);

    /// @notice Balance of the tokens
    /// @return Token balances in underlying pool
    function getHoldings() external view returns (uint256[] memory);
}
