// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

import "./IProtocolAPI.sol";
import "./IBinaryVault.sol";

/// @title Vault public interface.
/// @notice Interface for vault arbitrageurs and other observers.
interface IUserAPI {
    /// @notice Check if vault trading is enabled.
    /// @return If public swap is turned on, returns true, otherwise false.
    function isPublicSwap() external view returns (bool);

    /// @notice Get swap fee.
    /// @return Swap fee from underlying Balancer pool.
    function getSwapFee() external view returns (uint256);

    /// @notice Get token weight.
    /// @return Denormalized weight value from underlying Balancer pool.
    function getDenormalizedWeight(address token)
        external
        view
        returns (uint256);
}
