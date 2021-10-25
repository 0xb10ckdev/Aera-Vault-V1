// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

import "./IUserAPI.sol";
import "./IManagerAPI.sol";
import "./IProtocolAPI.sol";
import "./IBinaryVault.sol";

/**
 * @dev Interface for v0 vault. The minimum definition of a v0 mammon vault
 *      is that it supports the protocol API and two assets.
 *
 *      This code is not audited or tested. Please do not use in production.
 */
// solhint-disable-next-line no-empty-blocks
interface IMammonVaultV0 is IUserAPI, IManagerAPI, IProtocolAPI, IBinaryVault {

}
