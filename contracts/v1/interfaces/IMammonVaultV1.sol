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
    // Use struct parameter to avoid stack too deep error.
    // factory: Balancer Managed Pool Factory address.
    // name: Name of Pool Token.
    // symbol: Symbol of Pool Token.
    // tokens: Token addresses.
    // weights: Token weights.
    // swapFeePercentage: Pool swap fee.
    // manager: Vault manager address.
    // validator: Withdrawal validator contract address.
    // noticePeriod: Notice period (in seconds).
    // managementFee: Management fee earned proportion per second.
    // merkleOrchard: Merkle Orchard address.
    // description: Simple vault text description.
    struct NewVaultParams {
        address factory;
        string name;
        string symbol;
        IERC20[] tokens;
        uint256[] weights;
        uint256 swapFeePercentage;
        address manager;
        address validator;
        uint32 noticePeriod;
        uint256 managementFee;
        address merkleOrchard;
        string description;
    }
}
