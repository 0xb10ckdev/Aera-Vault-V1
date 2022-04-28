pragma solidity 0.8.11;

import "./celo-org/SafeMath.sol";

library UintMedian {
    using SafeMath for uint256;

    /**
    * @dev Returns the sorted middle, or the average of the two middle indexed
    * items if the array has an even number of elements
    * @param _list The list of elements to compare
    */
    function calculate(uint256[] memory _list)
        internal
        pure
        returns (uint256)
    {
        uint256 answerLength = _list.length;
        uint256 middleIndex = answerLength.div(2);
        if (answerLength % 2 == 0) {
            uint256 median1 = quickselect(copy(_list), middleIndex);
            uint256 median2 = quickselect(_list, middleIndex.add(1)); // quickselect is 1 indexed
            uint256 remainder = (median1 % 2 + median2 % 2) / 2;
            return (median1 / 2).add(median2 / 2).add(remainder); // signed integers are not supported by SafeMath
        } else {
            return quickselect(_list, middleIndex.add(1)); // quickselect is 1 indexed
        }
    }

    /**
    * @dev Returns the kth value of the ordered array
    * See: http://www.cs.yale.edu/homes/aspnes/pinewiki/QuickSelect.html
    * @param _a The list of elements to pull from
    * @param _k The index, 1 based, of the elements you want to pull from when ordered
    */
    function quickselect(uint256[] memory _a, uint256 _k)
        private
        pure
        returns (uint256)
    {
        uint256[] memory a = _a;
        uint256 k = _k;
        uint256 aLen = a.length;
        uint256[] memory a1 = new uint256[](aLen);
        uint256[] memory a2 = new uint256[](aLen);
        uint256 a1Len;
        uint256 a2Len;
        uint256 pivot;
        uint256 i;

        while (true) {
            pivot = a[aLen.div(2)];
            a1Len = 0;
            a2Len = 0;
            for (i = 0; i < aLen; i++) {
                if (a[i] < pivot) {
                    a1[a1Len] = a[i];
                    a1Len++;
                } else if (a[i] > pivot) {
                    a2[a2Len] = a[i];
                    a2Len++;
                }
            }
            if (k <= a1Len) {
                aLen = a1Len;
                (a, a1) = swap(a, a1);
            } else if (k > (aLen.sub(a2Len))) {
                k = k.sub(aLen.sub(a2Len));
                aLen = a2Len;
                (a, a2) = swap(a, a2);
            } else {
                return pivot;
            }
        }
    }

    /**
    * @dev Swaps the pointers to two uint256 arrays in memory
    * @param _a The pointer to the first in memory array
    * @param _b The pointer to the second in memory array
    */
    function swap(uint256[] memory _a, uint256[] memory _b)
        private
        pure
        returns(uint256[] memory, uint256[] memory)
    {
        return (_b, _a);
    }

    /**
    * @dev Makes an in memory copy of the array passed in
    * @param _list The pointer to the array to be copied
    */
    function copy(uint256[] memory _list)
        private
        pure
        returns(uint256[] memory)
    {
        uint256[] memory list2 = new uint256[](_list.length);
        for (uint256 i = 0; i < _list.length; i++) {
            list2[i] = _list[i];
        }
        return list2;
    }
}