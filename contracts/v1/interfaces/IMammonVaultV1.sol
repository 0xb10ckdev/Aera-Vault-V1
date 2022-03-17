// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "./IUserAPI.sol";
import "./IManagerAPI.sol";
import "./IProtocolAPI.sol";
import "./IMultiAssetVault.sol";

/// @title Interface for v1 vault.
// solhint-disable-next-line no-empty-blocks
interface IMammonVaultV1 is
    IUserAPI,
    IManagerAPI,
    IProtocolAPI,
    IMultiAssetVault
{

}
