// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

import "../dependencies/openzeppelin/IERC20.sol";

interface IBManagedPool {
    enum SwapKind {
        GIVEN_IN,
        GIVEN_OUT
    }

    struct SwapRequest {
        SwapKind kind;
        IERC20 tokenIn;
        IERC20 tokenOut;
        uint256 amount;
        bytes32 poolId;
        uint256 lastChangeBlock;
        address from;
        address to;
        bytes userData;
    }

    function getSwapEnabled() external view returns (bool);

    function getManagementSwapFeePercentage() external view returns (uint256);

    function getGradualWeightUpdateParams()
        external
        view
        returns (
            uint256 startTime,
            uint256 endTime,
            uint256[] memory endWeights
        );

    function updateWeightsGradually(
        uint256 startTime,
        uint256 endTime,
        uint256[] memory endWeights
    ) external;

    function getCollectedManagementFees()
        external
        view
        returns (IERC20[] memory tokens, uint256[] memory collectedFees);

    function withdrawCollectedManagementFees(address recipient) external;

    function setSwapEnabled(bool swapEnabled) external;

    function getLastInvariant() external pure returns (uint256);

    function getInvariant() external view returns (uint256);

    function getNormalizedWeights() external view returns (uint256[] memory);

    function getRate() external view returns (uint256);

    function onSwap(
        SwapRequest memory swapRequest,
        uint256 currentBalanceTokenIn,
        uint256 currentBalanceTokenOut
    ) external returns (uint256);
}