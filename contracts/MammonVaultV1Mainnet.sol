// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

import "./MammonVaultV1.sol";
import "./dependencies/openzeppelin/IERC20.sol";

contract MammonVaultV1Mainnet is MammonVaultV1 {
    /**
     * @dev Balancer addresses taken from https://docs.balancer.fi/v/v1/smart-contracts/addresses#mainnet
     */
    address private constant __bfactory =
        address(0x48767F9F868a4A7b86A90736632F6E44C2df7fa9);

    // solhint-disable no-empty-blocks
    constructor(
        address factory,
        string memory name,
        string memory symbol,
        IERC20[] memory tokens_,
        uint256[] memory weights_,
        uint256 swapFeePercentage,
        uint256 managementSwapFeePercentage,
        address manager_,
        address validator_,
        uint32 noticePeriod_,
        string memory description_
    )
        MammonVaultV1(
            factory,
            name,
            symbol,
            tokens_,
            weights_,
            swapFeePercentage,
            managementSwapFeePercentage,
            manager_,
            validator_,
            noticePeriod_,
            description_
        )
    {}
}
