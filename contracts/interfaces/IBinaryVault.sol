// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

/**
 * @dev Interface for generic two-asset vault.
 *      This code is not audited or tested. Please do not use in production.
 */
interface IBinaryVault {
    /// @notice The balance of first token on balancer pool.
    function holdings0() external view returns (uint256);

    /// @notice The balance of second token on balancer pool.
    function holdings1() external view returns (uint256);
}
