// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

import "./MammonVaultV1.sol";
import "./dependencies/openzeppelin/IERC20.sol";

contract MammonVaultV1Kovan is MammonVaultV1 {
    /**
     * @dev Balancer addresses taken from https://docs.balancer.fi/v/v1/smart-contracts/addresses#kovan
     */
    address public constant __bfactory =
        address(0x8f7F78080219d4066A8036ccD30D588B416a40DB);

    // solhint-disable no-empty-blocks
    constructor(
        address factory_,
        string memory name,
        string memory symbol,
        IERC20[] memory tokens_,
        uint256[] memory weights_,
        uint256 swapFeePercentage,
        uint256 managementSwapFeePercentage,
        address manager_,
        address validator_,
        uint32 noticePeriod_
    )
        MammonVaultV1(
            factory_,
            name,
            symbol,
            tokens_,
            weights_,
            swapFeePercentage,
            managementSwapFeePercentage,
            manager_,
            validator_,
            noticePeriod_
        )
    {}
}
