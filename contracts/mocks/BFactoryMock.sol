// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

import "./BPoolMock.sol";

/// @dev This code is not audited or tested. Please do not use in production.
contract BFactoryMock {
    function newBPool() external returns (address) {
        return address(new BPoolMock());
    }
}
