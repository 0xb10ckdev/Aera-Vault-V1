// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7;

import "./MammonVaultV0.sol";

/// @dev This code is not audited or tested. Please do not use in production.
contract MammonVaultV0Mainnet is MammonVaultV0 {
    /**
     * @dev Balancer addresses taken from https://docs.balancer.fi/v/v1/smart-contracts/addresses#mainnet
     */
    address private constant __bfactory =
        address(0x9424B1412450D0f8Fc2255FAf6046b98213B76Bd);

    // solhint-disable no-empty-blocks
    constructor(
        address _token0,
        address _token1,
        address _manager,
        address _validator,
        uint32 _noticePeriod
    )
        MammonVaultV0(
            __bfactory,
            _token0,
            _token1,
            _manager,
            _validator,
            _noticePeriod
        )
    {}
}
