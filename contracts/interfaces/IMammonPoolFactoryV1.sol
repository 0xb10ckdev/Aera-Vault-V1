// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../dependencies/openzeppelin/IERC20.sol";
import "./IBVault.sol";

interface IMammonPoolFactoryV1 {
    /// @notice Deploys a New Balancer ManagedPool.
    /// @param name Pool Token name.
    /// @param symbol Pool Token symbol.
    /// @param tokens Addresses of asset tokens.
    /// @param weights Initial weights of asset tokens.
    /// @param assetManagers Addresses of asset managers.
    /// @param swapFeePercentage Swap fee percentage.
    /// @param owner Pool controller.
    /// @param swapEnabledOnStart Swap enabled states on start.
    /// @param mustAllowlistLPs If true, only listed addresses can join the pool.
    /// @param managementSwapFeePercentage Management swap fee percentage.
    function create(
        string memory name,
        string memory symbol,
        IERC20[] memory tokens,
        uint256[] memory weights,
        address[] memory assetManagers,
        uint256 swapFeePercentage,
        address owner,
        bool swapEnabledOnStart,
        bool mustAllowlistLPs,
        uint256 managementSwapFeePercentage
    ) external returns (address);

    /// @notice Balancer vault
    /// @return Balancer vault for balancer pool
    function getVault() external view returns (IBVault);
}
