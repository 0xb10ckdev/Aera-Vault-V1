// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "./dependencies/openzeppelin/Ownable.sol";
import "./dependencies/openzeppelin/EnumerableSet.sol";
import "./interfaces/IManagerWhitelist.sol";

/// @title Manager whitelist management.
/// @notice ManagerWhitelist contract that manages manager list.
contract ManagerWhitelist is Ownable, IManagerWhitelist {
    using EnumerableSet for EnumerableSet.AddressSet;

    /// STORAGE SLOT START ///

    /// @notice Manager list.
    EnumerableSet.AddressSet private managers;

    /// EVENTS ///

    /// @notice Emitted when a new manager is added.
    /// @param manager New manager address.
    event ManagerAdded(address indexed manager);

    /// @notice Emitted when a manager is removed.
    /// @param manager Removed manager address.
    event ManagerRemoved(address indexed manager);

    /// ERRORS ///

    error ManagerIsZeroAddress();
    error AddressIsAlreadyManager();
    error AddressIsNotManager();

    /// FUNCTIONS ///

    /// @notice Initialize the contract by initializing manager list.
    /// @param managers_ Manager addresses.
    constructor(address[] memory managers_) {
        if (managers_.length > 0) {
            for (uint256 i = 0; i < managers_.length; i++) {
                _addManager(managers_[i]);
            }
        }
    }

    /// API ///

    /// @inheritdoc IManagerWhitelist
    function addManager(address manager) external override onlyOwner {
        _addManager(manager);
    }

    /// @inheritdoc IManagerWhitelist
    function removeManager(address manager) external override onlyOwner {
        bool result = managers.remove(manager);
        if (!result) {
            revert AddressIsNotManager();
        }

        emit ManagerRemoved(manager);
    }

    /// @inheritdoc IManagerWhitelist
    function isManager(address manager) external view override returns (bool) {
        return managers.contains(manager);
    }

    /// @inheritdoc IManagerWhitelist
    function getManagers() external view override returns (address[] memory) {
        return managers.values();
    }

    /// INTERNAL FUNCTIONS ///
    function _addManager(address manager) internal {
        if (manager == address(0)) {
            revert ManagerIsZeroAddress();
        }

        bool result = managers.add(manager);
        if (!result) {
            revert AddressIsAlreadyManager();
        }

        emit ManagerAdded(manager);
    }
}
