// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../../v1/dependencies/openzeppelin/IERC20.sol";
import "../dependencies/openzeppelin/ERC4626.sol";

/**
 * @dev Mock ERC4626 token with initial total supply and custom decimals.
 *      THIS CONTRACT IS FOR TESTING PURPOSES ONLY. DO NOT USE IN PRODUCTION.
 */
contract ERC4626Mock is ERC4626 {
    // solhint-disable no-empty-blocks
    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_
    ) ERC4626(asset_) ERC20(name_, symbol_) {}
}
