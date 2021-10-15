// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

/// @dev This code is not audited or tested. Please do not use in production.
interface IProtocolAPI {
    function initialDeposit(
        uint256 amount0,
        uint256 amount1,
        uint256 weight0,
        uint256 weight1
    ) external;

    function deposit(uint256 amount0, uint256 amount1) external;

    function withdraw(uint256 amount0, uint256 amount1) external;

    function initializeFinalization() external;

    function finalize() external;

    function setManager(address newManager) external;

    function sweep(address token, uint256 amount) external;
}
