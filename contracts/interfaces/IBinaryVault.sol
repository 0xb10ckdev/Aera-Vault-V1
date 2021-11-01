// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

/// @title Two-asset vault interface.
interface IBinaryVault {
    /// @notice Balance of the first token
    /// @return Token balance in underlying pool
    function holdings0() external view returns (uint256);

    /// @notice Balance of the second token
    /// @return Token balance in underlying pool
    function holdings1() external view returns (uint256);
}
