// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../v1/dependencies/openzeppelin/Ownable.sol";
import "../v1/dependencies/openzeppelin/EnumerableSet.sol";
import "./interfaces/IGuardianWhitelist.sol";

/// @title Protocol-level guardian whitelist.
/// @notice GuardianWhitelist contract that manages guardian list.
contract GuardianWhitelist is Ownable, IGuardianWhitelist {
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @notice Guardian list.
    EnumerableSet.AddressSet private guardians;

    /// EVENTS ///

    /// @notice Emitted when a new guardian is added.
    /// @param guardian New guardian address.
    event GuardianAdded(address indexed guardian);

    /// @notice Emitted when a guardian is removed.
    /// @param guardian Removed guardian address.
    event GuardianRemoved(address indexed guardian);

    /// ERRORS ///

    error Aera__GuardianIsZeroAddress();
    error Aera__AddressIsAlreadyGuardian();
    error Aera__AddressIsNotGuardian();

    /// FUNCTIONS ///

    /// @notice Initialize the contract by initializing guardian list.
    /// @param guardians_ Guardian addresses.
    constructor(address[] memory guardians_) {
        for (uint256 i = 0; i < guardians_.length; i++) {
            _addGuardian(guardians_[i]);
        }
    }

    /// API ///

    /// @inheritdoc IGuardianWhitelist
    function addGuardian(address guardian) external override onlyOwner {
        _addGuardian(guardian);
    }

    /// @inheritdoc IGuardianWhitelist
    function removeGuardian(address guardian) external override onlyOwner {
        bool result = guardians.remove(guardian);
        if (!result) {
            revert Aera__AddressIsNotGuardian();
        }

        emit GuardianRemoved(guardian);
    }

    /// @inheritdoc IGuardianWhitelist
    function isGuardian(address guardian)
        external
        view
        override
        returns (bool)
    {
        return guardians.contains(guardian);
    }

    /// @inheritdoc IGuardianWhitelist
    function getGuardians() external view override returns (address[] memory) {
        return guardians.values();
    }

    /// INTERNAL FUNCTIONS ///

    function _addGuardian(address guardian) internal {
        if (guardian == address(0)) {
            revert Aera__GuardianIsZeroAddress();
        }

        bool result = guardians.add(guardian);
        if (!result) {
            revert Aera__AddressIsAlreadyGuardian();
        }

        emit GuardianAdded(guardian);
    }
}
