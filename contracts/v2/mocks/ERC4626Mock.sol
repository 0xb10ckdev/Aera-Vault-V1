// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../../v1/dependencies/openzeppelin/IERC20.sol";
import "../dependencies/openzeppelin/ERC4626.sol";

/**
 * @dev Mock ERC4626 token with initial total supply.
 *      It just wrap tokens by using ERC4626 of OpenZeppelin.
 *      THIS CONTRACT IS FOR TESTING PURPOSES ONLY. DO NOT USE IN PRODUCTION.
 */
contract ERC4626Mock is ERC4626 {
    bool private paused;
    bool private useMaxWithdrawalAmount;
    uint256 private maxWithdrawalAmount;

    // solhint-disable no-empty-blocks
    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_
    ) ERC4626(asset_) ERC20(name_, symbol_) {}

    function maxWithdraw(address owner)
        public
        view
        virtual
        override
        returns (uint256)
    {
        if (paused) {
            revert("Vault is paused");
        }

        if (useMaxWithdrawalAmount) {
            return maxWithdrawalAmount;
        }

        return _convertToAssets(balanceOf(owner), Math.Rounding.Down);
    }

    function setMaxWithdrawalAmount(uint256 amount, bool use) external {
        maxWithdrawalAmount = amount;
        useMaxWithdrawalAmount = use;
    }

    function pause() external {
        paused = true;
    }
}
