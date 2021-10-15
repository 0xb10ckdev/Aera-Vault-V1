// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

import "../interfaces/IBPool.sol";

/// @dev This code is not audited or tested. Please do not use in production.
library SmartPoolManager {
    struct GradualUpdateParams {
        uint256 startBlock;
        uint256 endBlock;
        uint256[] startWeights;
        uint256[] endWeights;
    }

    // solhint-disable no-empty-blocks
    function updateWeightsGradually(
        IBPool bPool,
        GradualUpdateParams storage gradualUpdate,
        uint256[] calldata newWeights,
        uint256 startBlock,
        uint256 endBlock,
        uint256 minimumWeightChangeBlockPeriod
    ) external {}

    // solhint-disable no-empty-blocks
    function pokeWeights(
        IBPool bPool,
        GradualUpdateParams storage gradualUpdate
    ) external {}
}
