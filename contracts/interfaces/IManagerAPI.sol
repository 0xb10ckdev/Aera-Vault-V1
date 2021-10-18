// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

/// @dev This code is not audited or tested. Please do not use in production.
interface IManagerAPI {
    function setPublicSwap(bool value) external;

    /**
     * @dev Start moving weights gradually to target value.
     */
    function updateWeightsGradually(
        uint256 weight0,
        uint256 weight1,
        uint256 startBlock,
        uint256 endBlock
    ) external;

    /**
     * @dev Move underlying Balancer weights if updating gradually
     */
    function pokeWeights() external;

    function setSwapFee(uint256 newSwapFee) external;
}
