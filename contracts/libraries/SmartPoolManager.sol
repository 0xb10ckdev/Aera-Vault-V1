// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7;

import "../interfaces/IBPool.sol";

library SmartPoolManager {
    struct GradualUpdateParams {
        uint256 startBlock;
        uint256 endBlock;
        uint256[] startWeights;
        uint256[] endWeights;
    }

    function updateWeightsGradually(
        IBPool bPool,
        GradualUpdateParams storage gradualUpdate,
        uint256[] calldata newWeights,
        uint256 startBlock,
        uint256 endBlock,
        uint256 minimumWeightChangeBlockPeriod
    ) external {}

    function pokeWeights(
        IBPool bPool,
        GradualUpdateParams storage gradualUpdate
    ) external {}
}
