// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../dependencies/openzeppelin/IERC20.sol";
import "./IBVault.sol";

interface IBManagedPoolFactory {
    struct NewPoolParams {
        IBVault vault;
        string name;
        string symbol;
        IERC20[] tokens;
        uint256[] normalizedWeights;
        address[] assetManagers;
        uint256 swapFeePercentage;
        uint256 pauseWindowDuration;
        uint256 bufferPeriodDuration;
        address owner;
        bool swapEnabledOnStart;
        bool mustAllowlistLPs;
        uint256 managementSwapFeePercentage;
    }

    function create(NewPoolParams memory poolParams)
        external
        returns (address);

    function getVault() external view returns (IBVault);
}
