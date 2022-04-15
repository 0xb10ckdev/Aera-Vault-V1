// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

import "./dependencies/chainlink/Median.sol";
import "./dependencies/chainlink/WeightedMedian.sol";
import "./dependencies/celo-org/SortedLinkedListWithMedian.sol";

contract MammonMedian {
    using SortedLinkedListWithMedian for SortedLinkedListWithMedian.List;

    SortedLinkedListWithMedian.List private sortedLinkedList;

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

    function calculateSortedLinkedMedian() external view returns (uint256) {
        return sortedLinkedList.getMedianValue();
    }
}
