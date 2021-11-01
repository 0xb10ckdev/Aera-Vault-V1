// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

/// @title Interface for vault manager.
/// @notice Supports parameter submission.
interface IManagerAPI {
    /// @notice Emitted when public swap is turned on/off.
    /// @param value New state of public swap.
    function setPublicSwap(bool value) external;

    /// @notice Initiate weight move to target in given update window.
    /// @param targetWeight0 Target weight of first token.
    /// @param targetWeight1 Target weight of second token.
    /// @param startBlock Block number at which weight movement starts.
    /// @param endBlock Block number at which the weights should reach target.
    function updateWeightsGradually(
        uint256 targetWeight0,
        uint256 targetWeight1,
        uint256 startBlock,
        uint256 endBlock
    ) external;

    /// @notice Update weights if within update window.
    function pokeWeights() external;

    /// @notice Change swap fee.
    function setSwapFee(uint256 newSwapFee) external;
}
