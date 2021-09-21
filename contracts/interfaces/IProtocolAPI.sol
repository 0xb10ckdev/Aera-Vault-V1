// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7;

interface IProtocolAPI {
  function deposit(uint256 amount0, uint256 amount1) external;
  function withdraw(uint256 amount0, uint256 amount1) external;
  function finalize() external;
}