// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../dependencies/openzeppelin/IERC20.sol";
import "./IProtocolAPI.sol";

/// @title Interface for vault manager.
/// @notice Supports parameter submission.
// slither-disable-next-line name-reused
interface IManagerAPI {
    /// @notice Initiate weight moves to target in the given update window.
    /// @dev It adjusts the balance of assets in yield tokens according to weights.
    ///      These are checked by Balancer in internal transactions:
    ///       If target weight length and token length match.
    ///       If total sum of target weights is one.
    ///       If target weight is greater than minimum.
    /// @param tokenWithWeight Tokens with target weights.
    /// @param startTime Timestamp at which weight movement should start.
    /// @param endTime Timestamp at which the weights should reach target values.
    function updateWeightsGradually(
        IProtocolAPI.TokenValue[] memory tokenWithWeight,
        uint256 startTime,
        uint256 endTime
    ) external;

    /// @notice Cancel the active weight update schedule.
    /// @dev Keep calculated weights from the schedule at the time.
    function cancelWeightUpdates() external;

    /// @notice Change swap fee.
    /// @dev These are checked by Balancer in internal transactions:
    ///       If new swap fee is less than maximum.
    ///       If new swap fee is greater than minimum.
    function setSwapFee(uint256 newSwapFee) external;

    /// @notice Claim manager fee.
    /// @dev This function shouldn't be called too frequently.
    function claimManagerFees() external;

    /* This function is defined in IProtocolAPI.sol
    /// @notice Disable swap.
    function disableTrading() external;
    */

    /* This function is defined in IProtocolAPI.sol
    /// @notice Enable or disable using oracle prices.
    function setOraclesEnabled(bool enabled) external;
    */
}
