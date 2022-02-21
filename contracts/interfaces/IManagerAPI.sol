// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

/// @title Interface for vault manager.
/// @notice Supports parameter submission.
interface IManagerAPI {
    /// @notice Initiate weight move to target in given update window.
    /// @param targetWeights Target token weights.
    /// @param startTime Timestamp at which weight movement should start.
    /// @param endTime Timestamp at which the weights should reach target values.
    function updateWeightsGradually(
        uint256[] memory targetWeights,
        uint256 startTime,
        uint256 endTime
    ) external;

    /// @notice Cancel the active weight update schedule.
    /// @dev Keep calculated weights from the schedule at the time.
    function cancelWeightUpdates() external;

    /// @notice Change swap fee.
    function setSwapFee(uint256 newSwapFee) external;
}
