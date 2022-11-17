// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../../v1/dependencies/openzeppelin/IERC20.sol";

/// @title Vault public interface.
/// @notice Interface for vault arbitrageurs and other observers.
interface IUserAPI {
    /// @notice Check if vault trading is enabled.
    /// @return If public swap is turned on, returns true, otherwise false.
    function isSwapEnabled() external view returns (bool);

    /// @notice Get swap fee.
    /// @return Swap fee from underlying Balancer pool.
    function getSwapFee() external view returns (uint256);

    /// @notice Get Pool ID.
    /// @return Pool ID of Balancer pool on Vault.
    function poolId() external view returns (bytes32);

    /// @notice Accept ownership
    function acceptOwnership() external;
}
