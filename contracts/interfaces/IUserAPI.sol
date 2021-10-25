// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

import "./IProtocolAPI.sol";
import "./IBinaryVault.sol";

interface IUserAPI {
    /// @notice The state of public swap if it's turned on or off.
    /// @return If public swap is turned on, returns true, otherwise false.
    function isPublicSwap() external view returns (bool);

    /// @notice The swap fee.
    function getSwapFee() external view returns (uint256);

    /// @notice The weight of a token.
    /// @return The weight of a given token on the pool.
    function getDenormalizedWeight(address token)
        external
        view
        returns (uint256);
}
