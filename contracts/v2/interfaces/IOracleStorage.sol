// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../dependencies/chainlink/interfaces/AggregatorV2V3Interface.sol";

/// @title Interface for oracle storage.
interface IOracleStorage {
    /// @notice Returns an array of oracles.
    function getOracles()
        external
        view
        returns (AggregatorV2V3Interface[] memory);

    /// @notice Returns an array of units in oracle decimals.
    function getOracleUnits() external view returns (uint256[] memory);
}
