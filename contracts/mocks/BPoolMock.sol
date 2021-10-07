// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7;

import "../dependencies/openzeppelin/IERC20.sol";

/// @dev This code is not audited or tested. Please do not use in production.
contract BPoolMock {
    bool public publicSwap;
    uint256 public swapFee;

    mapping(address => uint256) public balances;
    mapping(address => uint256) public denorms;

    function bind(
        address token,
        uint256 balance,
        uint256 denorm
    ) external {
        rebind(token, balance, denorm);
    }

    function rebind(
        address token,
        uint256 balance,
        uint256 denorm
    ) public {
        uint256 currentBalance = balances[token];
        balances[token] = balance;
        denorms[token] = denorm;

        if (balance > currentBalance) {
            IERC20(token).transferFrom(
                msg.sender,
                address(this),
                balance - currentBalance
            );
        } else {
            IERC20(token).transfer(msg.sender, currentBalance - balance);
        }
    }

    function unbind(address token) public {
        uint256 currentBalance = balances[token];
        balances[token] = 0;
        denorms[token] = 0;

        IERC20(token).transfer(msg.sender, currentBalance);
    }

    function getBalance(address token) external view returns (uint256) {
        return balances[token];
    }

    function getDenormalizedWeight(address token)
        external
        view
        returns (uint256)
    {
        return denorms[token];
    }

    function setPublicSwap(bool newPublicSwap) external {
        publicSwap = newPublicSwap;
    }

    function setSwapFee(uint256 newSwapFee) external {
        swapFee = newSwapFee;
    }

    function getSwapFee() external view returns (uint256) {
        return swapFee;
    }

    function isPublicSwap() external view returns (bool) {
        return publicSwap;
    }

    // solhint-disable-next-line func-name-mixedcase
    function MIN_WEIGHT() external pure returns (uint256) {
        return 10**18;
    }

    // solhint-disable-next-line func-name-mixedcase
    function MAX_WEIGHT() external pure returns (uint256) {
        return 10**18 * 50;
    }

    // solhint-disable-next-line func-name-mixedcase
    function MIN_BALANCE() external pure returns (uint256) {
        return 10**6;
    }
}
