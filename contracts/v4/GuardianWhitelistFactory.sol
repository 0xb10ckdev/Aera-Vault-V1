// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../v1/dependencies/openzeppelin/Ownable.sol";
import "../v1/dependencies/openzeppelin/Create2.sol";
import "./GuardianWhitelist.sol";

/// @title Factory to deploy GuardianWhitelist contract.
contract GuardianWhitelistFactory is Ownable {
    /// EVENTS ///

    /// @notice Emitted when a new GuardianWhitelist is deployed.
    /// @param addr Deployed address of GuardianWhitelist.
    /// @param salt Used salt value for deployment.
    event Deployed(address indexed addr, uint256 salt);

    /// FUNCTIONS ///

    // solhint-disable no-empty-blocks
    constructor(address owner) {
        _transferOwnership(owner);
    }

    /// @notice Deploy GuardianWhitelist contract
    /// @param guardians Initial guardian addresses.
    /// @param salt Salt value to be used for deployment.
    function deploy(address[] calldata guardians, uint256 salt)
        external
        onlyOwner
    {
        GuardianWhitelist guardianWhitelist = new GuardianWhitelist{
            salt: bytes32(salt)
        }(guardians);
        guardianWhitelist.transferOwnership(msg.sender);

        // slither-disable-next-line reentrancy-events
        emit Deployed(address(guardianWhitelist), salt);
    }

    /// @notice Returns precomputed address
    /// @dev Returns the address where a contract will be stored if deployed via {deploy}.
    ///     Any change in the `bytecodeHash` or `salt` will result in a new destination address.
    /// @param guardians Initial guardian addresses.
    /// @param salt Salt value to be used for deployment.
    /// @return Precomputed address of GuardianWhitelist deployment.
    // slither-disable-next-line too-many-digits
    function computeAddress(address[] calldata guardians, uint256 salt)
        external
        view
        returns (address)
    {
        bytes32 bytecodeHash = keccak256(
            abi.encodePacked(
                type(GuardianWhitelist).creationCode,
                abi.encode(guardians)
            )
        );

        address addr = Create2.computeAddress(
            bytes32(salt),
            bytecodeHash,
            address(this)
        );

        return addr;
    }
}
