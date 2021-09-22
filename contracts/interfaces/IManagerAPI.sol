// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7;

interface IManagerAPI {
    function setPublicSwap(bool value) external;

    function updateWeightsGradually(
        uint256 weight0,
        uint256 weight1,
        uint256 startBlock,
        uint256 endBlock
    ) external;

    function pokeWeights() external;

    function setSwapFee(uint256 newSwapFee) external;
}
