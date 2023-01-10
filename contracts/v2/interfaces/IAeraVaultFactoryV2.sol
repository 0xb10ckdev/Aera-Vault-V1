// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "./IAeraVaultV2.sol";

/// @title Interface for v2 vault factory.
interface IAeraVaultFactoryV2 {
    /// @notice Create v2 vault.
    /// @param vaultParams Struct vault parameter.
    function create(IAeraVaultV2.NewVaultParams memory vaultParams) external;
}
