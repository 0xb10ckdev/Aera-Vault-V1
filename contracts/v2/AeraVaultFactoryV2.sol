// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "./dependencies/openzeppelin/Ownable.sol";
import "./interfaces/IAeraVaultFactoryV2.sol";
import "./AeraVaultV2.sol";

/// @title Aera Vault Factory.
contract AeraVaultFactoryV2 is IAeraVaultFactoryV2, Ownable {
    /// EVENTS ///

    /// @notice Emitted when the vault is created.
    /// @param vault Vault address.
    /// @param vaultParams Struct vault parameter.
    event VaultCreated(address vault, AeraVaultV2.NewVaultParams vaultParams);

    /// FUNCTIONS ///

    // solhint-disable no-empty-blocks
    constructor() {}

    /// @inheritdoc IAeraVaultFactoryV2
    function create(AeraVaultV2.NewVaultParams memory vaultParams)
        external
        override
        onlyOwner
    {
        AeraVaultV2 vault = new AeraVaultV2(vaultParams);
        vault.transferOwnership(newOwner);

        emit VaultCreated(address(vault), vaultParams);
    }
}
