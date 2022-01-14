// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "./BPoolMock.sol";

contract BFactoryMock {
    function newBPool() external returns (address) {
        return address(new BPoolMock());
    }
}
