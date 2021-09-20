// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

interface IBPool {
    function bind(address token, uint balance, uint denorm) external;
    function rebind(address token, uint balance, uint denorm) external;
    function gulp(address token) external;

    function setSwapFee(uint swapFee) external;
    function setPublicSwap(bool publicSwap) external;

    function isPublicSwap() external view returns (bool);
    function getSwapFee() external view returns (uint);
    function getSpotPrice(address tokenIn, address tokenOut) external view returns (uint);
    function getSpotPriceSansFee(address tokenIn,address tokenOut) external view returns (uint);
    function getBalance(address token) external view returns (uint);
    function getDenormalizedWeight(address token) external view returns (uint);
    function getCurrentTokens() external view returns (address[] memory tokens);
    function totalSupply() external view returns (uint);
}