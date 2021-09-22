// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7;

/**
 * @dev Binary vault interface which supports only two tokens
 */
interface IBinaryVault {
    /**
     * @dev Returns Vault holdings of token0
     */
    function holdings0() external view returns (uint256);

    /**
     * @dev Returns Vault holdings of token1
     */
    function holdings1() external view returns (uint256);
}
