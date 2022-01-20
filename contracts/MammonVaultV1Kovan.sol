// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

import "./MammonVaultV1.sol";
import "./dependencies/openzeppelin/IERC20.sol";

contract MammonVaultV1Kovan is MammonVaultV1 {
    /**
     * @dev Balancer addresses taken from https://docs.balancer.fi/v/v1/smart-contracts/addresses#kovan
     */
    address public constant __bfactory =
        address(0xb08E16cFc07C684dAA2f93C70323BAdb2A6CBFd2);

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
