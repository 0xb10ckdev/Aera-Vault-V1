// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

// solhint-disable
library WeightedMedian {
    uint256 constant INT_MAX = 2**255-1;
    uint256 constant MEDIUM = 10 ** 18 / 2;
    uint256 constant SHORTSELECTTWO_MAX_LENGTH = 7;

    /**
     * @notice Returns the sorted middle, or the average of the two middle indexed items if the
     * array has an even number of elements.
     * @dev The list passed as an argument isn't modified.
     * @dev This algorithm has expected runtime O(n), but for adversarially chosen inputs
     * the runtime is O(n^2).
     * @param list The list of elements to compare
     */
    function calculate(uint256[] memory list, uint256[] memory weights)
        internal
        pure
        returns (uint256)
    {
        uint256 lo;
        uint256 hi = list.length - 1;
        uint256 pivotIndex;
        uint256 weightSum;
        uint256 prevSum;

        while (true) {
            if (hi - lo < SHORTSELECTTWO_MAX_LENGTH) {
                return shortSelect(list, weights, lo, hi, weightSum);
            }

            (pivotIndex, weightSum) = partition(list, weights, lo, hi, weightSum);

            if (weightSum > MEDIUM) {
                hi = pivotIndex;
                weightSum = prevSum;
            } else if (weightSum + weights[pivotIndex] < MEDIUM) {
                lo = pivotIndex;
                prevSum = weightSum;
            } else {
                return list[pivotIndex];
            }
        }
    }

    /**
     * @notice Select median element from list of length at most SHORTSELECTTWO_MAX_LENGTH
     * @dev Uses an optimal sorting network
     */
    function shortSelect(
        uint256[] memory list,
        uint256[] memory weights,
        uint256 lo,
        uint256 hi,
        uint256 prevSum
    ) private pure returns (uint256 median) {
        // Uses an optimal sorting network (https://en.wikipedia.org/wiki/Sorting_network)
        // for lists of length 7. Network layout is taken from
        // http://jgamble.ripco.net/cgi-bin/nw.cgi?inputs=7&algorithm=hibbard&output=svg

        uint256 len = hi + 1 - lo;
        uint256 weightSum = prevSum;
        uint256[] memory x = new uint256[](SHORTSELECTTWO_MAX_LENGTH);
        uint256[] memory w = new uint256[](SHORTSELECTTWO_MAX_LENGTH);

        for (uint256 i = 0; i < len; i++) {
            x[i] = list[lo + i];
            w[i] = weights[lo + i];
        }
        for (uint256 i = len; i < SHORTSELECTTWO_MAX_LENGTH; i++) {
            x[i] = INT_MAX;
            w[i] = INT_MAX;
        }

        if (x[0] > x[1]) { (x[0], x[1]) = (x[1], x[0]); (w[0], w[1]) = (w[1], w[0]); }
        if (x[2] > x[3]) { (x[2], x[3]) = (x[3], x[2]); (w[2], w[3]) = (w[3], w[2]); }
        if (x[4] > x[5]) { (x[4], x[5]) = (x[5], x[4]); (w[4], w[5]) = (w[5], w[4]); }
        if (x[0] > x[2]) { (x[0], x[2]) = (x[2], x[0]); (w[0], w[2]) = (w[2], w[0]); }
        if (x[1] > x[3]) { (x[1], x[3]) = (x[3], x[1]); (w[1], w[3]) = (w[3], w[1]); }
        if (x[4] > x[6]) { (x[4], x[6]) = (x[6], x[4]); (w[4], w[6]) = (w[6], w[4]); }
        if (x[1] > x[2]) { (x[1], x[2]) = (x[2], x[1]); (w[1], w[2]) = (w[2], w[1]); }
        if (x[5] > x[6]) { (x[5], x[6]) = (x[6], x[5]); (w[5], w[6]) = (w[6], w[5]); }
        if (x[0] > x[4]) { (x[0], x[4]) = (x[4], x[0]); (w[0], w[4]) = (w[4], w[0]); }
        if (x[1] > x[5]) { (x[1], x[5]) = (x[5], x[1]); (w[1], w[5]) = (w[5], w[1]); }
        if (x[2] > x[6]) { (x[2], x[6]) = (x[6], x[2]); (w[2], w[6]) = (w[6], w[2]); }
        if (x[1] > x[4]) { (x[1], x[4]) = (x[4], x[1]); (w[1], w[4]) = (w[4], w[1]); }
        if (x[3] > x[6]) { (x[3], x[6]) = (x[6], x[3]); (w[3], w[6]) = (w[6], w[3]); }
        if (x[2] > x[4]) { (x[2], x[4]) = (x[4], x[2]); (w[2], w[4]) = (w[4], w[2]); }
        if (x[3] > x[5]) { (x[3], x[5]) = (x[5], x[3]); (w[3], w[5]) = (w[5], w[3]); }
        if (x[3] > x[4]) { (x[3], x[4]) = (x[4], x[3]); (w[3], w[4]) = (w[4], w[3]); }

        for (uint256 i = 0; i < len; i++) {
            weightSum += w[i];
            if (weightSum >= MEDIUM) {
                return x[i];
            }
        }
    }

    /**
     * @notice Partitions list in-place using Hoare's partitioning scheme.
     * Only elements of list between indices lo and hi (inclusive) will be modified.
     * Returns an index i, such that:
     * - lo <= i < hi
     * - forall j in [lo, i]. list[j] <= list[i]
     * - forall j in [i, hi]. list[i] <= list[j]
     */
    function partition(
        uint256[] memory list,
        uint256[] memory weights,
        uint256 lo,
        uint256 hi,
        uint256 prevSum
    ) private pure returns (uint256, uint256) {
        // We don't care about overflow of the addition, because it would require a list
        // larger than any feasible computer's memory.
        uint256 weightSum = prevSum;
        uint256 left = lo;
        uint256 pivot = list[(lo + hi) / 2];
        unchecked {
            lo -= 1; // this can underflow. that's intentional.
            hi += 1;
        }
        while (true) {
            do {
                unchecked { lo += 1; }
            } while (list[lo] < pivot);
            do {
                unchecked { hi -= 1; }
            } while (list[hi] > pivot);
            if (lo < hi) {
                (list[lo], list[hi]) = (list[hi], list[lo]);
                (weights[lo], weights[hi]) = (weights[hi], weights[lo]);
            } else {
                // Let orig_lo and orig_hi be the original values of lo and hi passed to partition.
                // Then, hi < orig_hi, because hi decreases *strictly* monotonically
                // in each loop iteration and
                // - either list[orig_hi] > pivot, in which case the first loop iteration
                //   will achieve hi < orig_hi;
                // - or list[orig_hi] <= pivot, in which case at least two loop iterations are
                //   needed:
                //   - lo will have to stop at least once in the interval
                //     [orig_lo, (orig_lo + orig_hi)/2]
                //   - (orig_lo + orig_hi)/2 < orig_hi
                for (; left < hi; left++) {
                    weightSum += weights[left];
                }
                return (hi, weightSum);
            }
        }
    }
}