// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

/// @dev This code is not audited or tested. Please do not use in production.
interface IBFactory {
    function newBPool() external returns (address);
}
