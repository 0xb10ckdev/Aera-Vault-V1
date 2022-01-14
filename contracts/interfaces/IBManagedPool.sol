// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../dependencies/openzeppelin/IERC20.sol";

interface IBManagedPool {
    function updateWeightsGradually(
        uint256 startTime,
        uint256 endTime,
        uint256[] memory endWeights
    ) external;

    function setSwapFeePercentage(uint256 swapFeePercentage) external;

    function setSwapEnabled(bool swapEnabled) external;

    function getSwapEnabled() external view returns (bool);

    function getSwapFeePercentage() external view returns (uint256);

    function getNormalizedWeights() external view returns (uint256[] memory);

    function getPoolId() external view returns (bytes32);
}
