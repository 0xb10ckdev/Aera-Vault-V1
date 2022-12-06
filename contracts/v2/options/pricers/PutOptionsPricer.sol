// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../../../v1/dependencies/openzeppelin/IERC165.sol";

interface PutOptionsPricer is IERC165 {
    /// @notice Calculate options premium for 1 options contract
    function getPremium(
        uint256 strikePrice,
        uint256 expiryTimestamp,
        bool isPut
    ) external view returns (uint256 premium);

    /// @notice Returns the spot price of assets (options underlying vs. options strike asset)
    function getSpot() external view returns (uint256 spotPrice);
}
