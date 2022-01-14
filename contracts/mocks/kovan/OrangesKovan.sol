// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../../dependencies/openzeppelin/ERC20PresetMinterPauser.sol";

/// @notice Mock token to be used in Kovan Balancer pools as token1.
/// @dev THIS CONTRACT IS FOR TESTING PURPOSES ONLY. DO NOT USE IN PRODUCTION.
contract OrangesKovan is ERC20PresetMinterPauser {
    // solhint-disable no-empty-blocks
    constructor() ERC20PresetMinterPauser("Oranges", "ORNGZ") {}
}
