// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

/// @title Interface for ManagerWhitelist.
interface IManagerWhitelist {
    /// @notice Add a new manager to list.
    /// @param manager New manager address to add.
    function addManager(address manager) external;

    /// @notice Remove a manager from list.
    /// @param manager Manager address to remove.
    function removeManager(address manager) external;

    /// @notice Check if given address is manager.
    /// @param manager Manager address to check.
    /// @return If an address is manager, returns true, otherwise false.
    function isManager(address manager) external view returns (bool);

    /// @notice Return all manager addresses
    /// @return Manager addresses in the list.
    function getManagers() external view returns (address[] memory);
}
