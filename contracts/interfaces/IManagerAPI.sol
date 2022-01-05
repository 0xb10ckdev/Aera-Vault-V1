// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

/// @title Interface for vault manager.
/// @notice Supports parameter submission.
interface IManagerAPI {
    /// @notice Enable or disable swap.
    /// @param value New state of swap.
    function setSwapEnabled(bool value) external;

    /// @notice Initiate weight move to target in given update window.
    /// @param targetWeights Target weights of tokens.
    /// @param startTime Timestamp at when weight movement starts.
    /// @param endTime Timestamp at when the weights should reach target.
    function updateWeightsGradually(
        uint256[] memory targetWeights,
        uint256 startTime,
        uint256 endTime
    ) external;

    /// @notice Change swap fee.
    function setSwapFee(uint256 newSwapFee) external;
}
