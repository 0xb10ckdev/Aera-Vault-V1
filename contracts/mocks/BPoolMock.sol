// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7;

import "../dependencies/openzeppelin/IERC20.sol";

/// @dev This code is not audited or tested. Please do not use in production.
contract BPoolMock {
    mapping(address=>uint256) public balances;
    mapping(address=>uint256) public denorms;

    constructor() {}

    function bind(
        address token,
        uint balance,
        uint denorm
    ) external {
        rebind(token, balance, denorm);
    }

    function rebind(
        address token,
        uint256 balance,
        uint256 denorm
    ) public {
        if (balance > balances[token]) {
            IERC20(token).transferFrom(
                msg.sender, address(this), balance - balances[token]
            );
        } else {
            IERC20(token).transfer(
                msg.sender, balances[token] - balance
            );
        }
        balances[token] = balance;
        denorms[token] = denorm;
    }

    function unbind(address token) public {
        IERC20(token).transfer(msg.sender, balances[token]);
        balances[token] = 0;
        denorms[token] = 0;
    }

    function getBalance(address token)
        external view returns(uint256)
    {
        return balances[token];
    }

    function getDenormalizedWeight(address token)
        external view returns (uint256)
    {
        return denorms[token];
    }

    function MIN_WEIGHT() external view returns(uint256) {
        return 10**18;
    }

    function MAX_WEIGHT() external view returns(uint256) {
        return 10**18 * 50;
    }

    function MIN_BALANCE() external view returns(uint256) {
        return 10**6;
    }
}
