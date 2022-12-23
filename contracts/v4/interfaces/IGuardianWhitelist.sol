// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

/// @title Interface for GuardianWhitelist.
interface IGuardianWhitelist {
    /// @notice Add a new guardian to list.
    /// @param guardian New guardian address to add.
    function addGuardian(address guardian) external;

    /// @notice Remove a guardian from list.
    /// @param guardian Guardian address to remove.
    function removeGuardian(address guardian) external;

    /// @notice Check if given address is guardian.
    /// @param guardian Guardian address to check.
    /// @return If an address is guardian, returns true, otherwise false.
    function isGuardian(address guardian) external view returns (bool);

    /// @notice Return all guardian addresses
    /// @return Guardian addresses in the list.
    function getGuardians() external view returns (address[] memory);
}
