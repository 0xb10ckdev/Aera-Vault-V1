// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

import "./SafeMathChainlink.sol";
import "./SignedSafeMath.sol";

// solhint-disable
library WeightedMedian {
    using SignedSafeMath for int256;

    int256 constant ONE = 10 ** 18;
    int256 constant MEDIUM = ONE / 2;

    error InvalidSum(int256 actual);
    error InvalidLength(uint256 listLength, uint256 weightLength);

    function calculate(int256[] memory list, int256[] memory weights) internal pure returns (int256) {
        uint256 len = list.length;

        if (len != weights.length) {
            revert InvalidLength(len, weights.length);
        }

        int256 weightSum = 0;
        for (uint256 i = 0; i < len; i++) {
            weightSum += weights[i];
        }

        if (weightSum != ONE) {
            revert InvalidSum(weightSum);
        }

        for (uint256 i = 0; i < len; i++) {
            for (uint256 j = len - 1; j > i; j--) {
                if (list[j] < list[j - 1]) {
                    (list[j], list[j - 1]) = (list[j - 1], list[j]);
                    (weights[j], weights[j - 1]) = (weights[j - 1], weights[j]);
                }
            }
        }

        int256 loSum = weights[0];
        int256 hiSum = 0;
        uint256 index = 0;

        while (loSum < MEDIUM) {
            index++;
            loSum += weights[index];
        }

        hiSum = ONE - loSum;
        loSum -= weights[index];

        while(loSum > MEDIUM || hiSum > MEDIUM) {
            loSum += weights[index];
            index++;
            hiSum -= weights[index];
        }

        return list[index];
    }
}