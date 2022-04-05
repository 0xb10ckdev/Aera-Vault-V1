// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

import "./dependencies/chainlink/Median.sol";

contract MammonMedian {
    // solhint-disable-next-line no-empty-blocks
    constructor() {}

    function calculate(int256[] calldata list) external pure returns (int256) {
        return Median.calculate(list);
    }
}
