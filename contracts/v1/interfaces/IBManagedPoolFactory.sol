// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../dependencies/openzeppelin/IERC20.sol";
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
        uint256 protocolSwapFeePercentage;
        uint256 managementSwapFeePercentage;
        uint256 managementAumFeePercentage;
        address aumProtocolFeesCollector;
    }

    struct BasePoolRights {
        bool canTransferOwnership;
        bool canChangeSwapFee;
        bool canUpdateMetadata;
    }

    struct ManagedPoolRights {
        bool canChangeWeights;
        bool canDisableSwaps;
        bool canSetMustAllowlistLPs;
        bool canSetCircuitBreakers;
        bool canChangeTokens;
        bool canChangeMgmtFees;
    }

    function create(
        NewPoolParams memory poolParams,
        BasePoolRights memory basePoolRights,
        ManagedPoolRights memory managedPoolRights,
        uint256 minWeightChangeDuration,
        address manager
    ) external returns (address);
}
