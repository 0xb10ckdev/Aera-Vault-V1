// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7;


/// @dev This code is not audited or tested. Please do not use in production.
interface IBPool {
    function bind(
        address token,
        uint256 balance,
        uint256 denorm
    ) external;

    function rebind(
        address token,
        uint256 balance,
        uint256 denorm
    ) external;

    function unbind(address token) external;

    function gulp(address token) external;

    function finalize() external;

    function setSwapFee(uint256 swapFee) external;

    function setPublicSwap(bool publicSwap) external;

    function isPublicSwap() external view returns (bool);

    function getSwapFee() external view returns (uint256);

    function getBalance(address token) external view returns (uint256);

    function getDenormalizedWeight(address token)
        external
        view
        returns (uint256);

    // solhint-disable-next-line func-name-mixedcase
    function MIN_WEIGHT() external view returns (uint256);

    // solhint-disable-next-line func-name-mixedcase
    function MAX_WEIGHT() external view returns (uint256);

    // solhint-disable-next-line func-name-mixedcase
    function MIN_BALANCE() external view returns (uint256);
}
