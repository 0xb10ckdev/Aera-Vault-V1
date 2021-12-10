// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

import "../dependencies/openzeppelin/IERC20.sol";

interface IMammonPoolFactoryV1 {
    function create(
        string memory name,
        string memory symbol,
        IERC20[] memory tokens,
        uint256[] memory weights,
        address[] memory assetManagers,
        uint256 swapFeePercentage,
        address owner,
        bool swapEnabledOnStart,
        uint256 managementSwapFeePercentage
    ) external returns (address);

    function getVault() external view returns (address);
}
