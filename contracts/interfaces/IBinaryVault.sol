// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7;

/**
 * @dev Interface for generic two-asset vault.
 *      This code is not audited or tested. Please do not use in production.
 */
interface IBinaryVault {
    /**
     * @dev Return balance of token0 in the vault.
     */
    function holdings0() external view returns (uint256);

    /**
     * @dev Return balance of token1 in the vault.
     */
    function holdings1() external view returns (uint256);
}
