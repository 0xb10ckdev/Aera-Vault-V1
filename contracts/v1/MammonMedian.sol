// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

import "./dependencies/median/chainlink/Median.sol";
import "./dependencies/median/chainlink/WeightedMedian.sol";
import "./dependencies/median/celo-org/SortedLinkedListWithMedian.sol";
import "./dependencies/median/MedianOracle.sol";
import "./dependencies/median/UintMedian.sol";
import "./dependencies/median/UintWeightedMedian.sol";

contract MammonMedian {
    using SortedLinkedListWithMedian for SortedLinkedListWithMedian.List;

    SortedLinkedListWithMedian.List private sortedLinkedList;

    // solhint-disable-next-line no-empty-blocks
    constructor() {}

    function calculateWithChainlinkMedian(int256[] calldata list)
        external
        pure
        returns (int256)
    {
        return Median.calculate(list);
    }

    function calculateWithChainlinkWeightedMedian(
        uint256[] memory list,
        uint256[] memory weights
    ) external pure returns (uint256) {
        return WeightedMedian.calculate(list, weights);
    }

    function calculateWithMedianOracle(uint256[] memory list)
        external
        pure
        returns (uint256)
    {
        return Select.computeMedian(list, list.length);
    }

    function calculateWithUintMedian(uint256[] memory list)
        external
        pure
        returns (uint256)
    {
        return UintMedian.calculate(list);
    }

    function calculateWithUintWeightedMedian(
        uint256[] memory list,
        uint256[] memory weights
    ) external pure returns (uint256) {
        return UintWeightedMedian.calculate(list, weights);
    }

    function updateList(uint256[] calldata list) external {
        // slither-disable-next-line uninitialized-local
        uint256 lesserKey;
        uint256 greaterKey;
        uint256 len = list.length;
        for (uint256 i = 0; i < len; i++) {
            (
                uint256[] memory keys,
                uint256[] memory values,

            ) = sortedLinkedList.getElements();
            for (uint256 j = 0; j < keys.length; j++) {
                if (values[j] > list[i]) {
                    greaterKey = keys[j];
                } else {
                    lesserKey = keys[j];
                    break;
                }
            }
            sortedLinkedList.insert(i + 1, list[i], lesserKey, greaterKey);
        }
    }

    function calculateWithSortedLinkedMedian()
        external
        view
        returns (uint256)
    {
        return sortedLinkedList.getMedianValue();
    }
}
