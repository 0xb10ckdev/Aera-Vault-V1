// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

interface IBinaryVault {
    /// @notice The balance of first token on balancer pool.
    function holdings0() external view returns (uint256);

    /// @notice The balance of second token on balancer pool.
    function holdings1() external view returns (uint256);
}
