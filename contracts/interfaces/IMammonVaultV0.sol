// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7;

import "./IProtocolAPI.sol";
import "./IBinaryVault.sol";

/**
 * @dev Interface for v0 vault. The minimum definition of a v0 mammon vault
 *      is that it supports the protocol API and two assets.
 *
 *      This code is not audited or tested. Please do not use in production.
 */
interface IMammonVaultV0 is IProtocolAPI, IBinaryVault {
    function isPublicSwap() external view returns (bool);

    function getSwapFee() external view returns (uint256);

    function getDenormalizedWeight(address token)
        external
        view
        returns (uint256);
}
