// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7;

interface IProtocolAPI {
    function initialDeposit(
        uint256 amount0,
        uint256 amount1,
        uint256 weight0,
        uint256 weight1
    ) external;

    function deposit(uint256 amount0, uint256 amount1) external;

    function withdraw(uint256 amount0, uint256 amount1) external;

    function finalize() external;
}
