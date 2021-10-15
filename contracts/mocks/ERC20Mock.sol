// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

import "../dependencies/openzeppelin/ERC20.sol";

/**
 * @dev Mock ERC20 token with initial total supply and custom decimals.
 *      THIS CONTRACT IS FOR TESTING PURPOSES ONLY. DO NOT USE IN PRODUCTION.
 */
contract ERC20Mock is ERC20 {
    uint8 internal _decimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 totalSupply_
    ) ERC20(name_, symbol_) {
        _decimals = decimals_;
        _mint(msg.sender, totalSupply_);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
}
