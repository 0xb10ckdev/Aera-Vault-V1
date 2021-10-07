// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7;

import "../../interfaces/IBPool.sol";

/// @dev This code is not audited or tested. Please do not use in production.
library SmartPoolManagerMock {
    struct GradualUpdateParams {
        uint256 startBlock;
        uint256 endBlock;
        uint256[] startWeights;
        uint256[] endWeights;
    }

    // solhint-disable no-unused-vars
    function updateWeightsGradually(
        IBPool bPool,
        GradualUpdateParams storage gradualUpdate,
        uint256[] memory newWeights,
        uint256 startBlock,
        uint256 endBlock,
        uint256 minimumWeightChangeBlockPeriod
    ) internal {
        revert("updateWeightsGradually is called");
    }

    // solhint-disable no-unused-vars
    function pokeWeights(
        IBPool bPool,
        GradualUpdateParams storage gradualUpdate
    ) internal {
        revert("pokeWeights is called");
    }
}
