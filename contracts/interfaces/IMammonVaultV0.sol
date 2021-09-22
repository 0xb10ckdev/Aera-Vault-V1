// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7;

import './IProtocolAPI.sol';
import './IManagerAPI.sol';

interface IMammonVaultV0 is IProtocolAPI, IManagerAPI {
    function initialDeposit(
        uint256 amount0,
        uint256 amount1,
        uint256 weight0,
        uint256 weight1
    )
        external;

    function gulp(address token) external;

    function setPublicSwap(bool value) external ;

    function isPublicSwap() external view returns (bool);

    function getSwapFee() external view returns (uint256);

    function getBalance(address token) external view returns (uint256);

    function getDenormalizedWeight(address token)
        external
        view
        returns (uint256);
}
