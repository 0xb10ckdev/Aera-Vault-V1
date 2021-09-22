// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7;

import "./MammonVaultV0.sol";

contract MammonVaultV0Kovan is MammonVaultV0 {
    /**
     * @dev Balancer addresses taken from https://docs.balancer.fi/v/v1/smart-contracts/addresses#kovan
     */
    address public constant __bfactory =
        address(0x8f7F78080219d4066A8036ccD30D588B416a40DB);

    constructor(
        address _token0,
        address _token1,
        address _manager
    ) MammonVaultV0(__bfactory, _token0, _token1, _manager) {}
}
