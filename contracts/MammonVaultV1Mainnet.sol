// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

import "./MammonVaultV1.sol";
import "./dependencies/openzeppelin/IERC20.sol";

contract MammonVaultV1Mainnet is MammonVaultV1 {
    /**
     * @dev Balancer addresses taken from https://docs.balancer.fi/v/v1/smart-contracts/addresses#mainnet
     */
    address private constant __bfactory =
        address(0x9424B1412450D0f8Fc2255FAf6046b98213B76Bd);

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
