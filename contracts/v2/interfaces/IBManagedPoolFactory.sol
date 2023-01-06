// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../dependencies/balancer-labs/interfaces/contracts/solidity-utils/openzeppelin/IERC20.sol";
import "./IBVault.sol";

interface IBManagedPoolFactory {
    struct NewPoolParams {
        string name;
        string symbol;
        IERC20[] tokens;
        uint256[] normalizedWeights;
        address[] assetManagers;
        uint256 swapFeePercentage;
        bool swapEnabledOnStart;
        bool mustAllowlistLPs;
        uint256 managementAumFeePercentage;
        uint256 aumFeeId;
    }

    function create(NewPoolParams memory poolParams, address manager)
        external
        returns (address);
}
