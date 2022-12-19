// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../dependencies/openzeppelin/IERC4626.sol";

/// @title Interface for yield token storage.
interface IYieldTokenStorage {
    /// @notice Returns an array of yield tokens.
    function getYieldTokens() external view returns (IERC4626[] memory);

    /// @notice Returns an array of withdrawal abilities of yield tokens.
    function getWithdrawables() external view returns (bool[] memory);

    /// @notice Returns an array of underlying indexes.
    function getUnderlyingIndexes() external view returns (uint256[] memory);
}
