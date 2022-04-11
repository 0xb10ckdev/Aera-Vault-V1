// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

import "./dependencies/chainlink/Median.sol";
import "./dependencies/chainlink/WeightedMedian.sol";

contract MammonMedian {
    // solhint-disable-next-line no-empty-blocks
    constructor() {}

    function calculateMedian(int256[] calldata list)
        external
        pure
        returns (int256)
    {
        return Median.calculate(list);
    }

    function calculateWeightedMedian(
        int256[] memory list,
        int256[] memory weights
    ) external pure returns (int256) {
        return WeightedMedian.calculate(list, weights);
    }
}
