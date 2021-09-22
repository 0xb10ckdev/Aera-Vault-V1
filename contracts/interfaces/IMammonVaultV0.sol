// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7;

import "./IProtocolAPI.sol";
import "./IManagerAPI.sol";

import "./IBinaryVault.sol";

interface IMammonVaultV0 is IProtocolAPI, IManagerAPI, IBinaryVault {
    function changeManager(address newManager) external;

    function isPublicSwap() external view returns (bool);

    function getSwapFee() external view returns (uint256);

    function getDenormalizedWeight(address token)
        external
        view
        returns (uint256);
}
