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

    /// @notice Emitted when manager list is initialized.
    /// @param managers Manager addresses.
    event ManagerInitialized(address[] managers);

    /// @notice Emitted when a new manager is added.
    /// @param manager New manager address.
    event ManagerCreated(address indexed manager);

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
                if (managers_[i] == address(0)) {
                    revert ManagerIsZeroAddress();
                }
            }

            emit ManagerInitialized(managers_);
        }
    }

    /// API ///

    /// @inheritdoc IManagerWhitelist
    function addManager(address manager) external override onlyOwner {
        if (manager == address(0)) {
            revert ManagerIsZeroAddress();
        }

        bool result = managers.add(manager);
        if (!result) {
            revert AddressIsAlreadyManager();
        }

        emit ManagerCreated(manager);
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
}
