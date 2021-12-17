// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

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

    function swapExactAmountIn(
        address tokenIn,
        uint256 tokenAmountIn,
        address tokenOut,
        uint256 minAmountOut,
        uint256 maxPrice
    ) external returns (uint256 tokenAmountOut, uint256 spotPriceAfter);

    function swapExactAmountOut(
        address tokenIn,
        uint256 maxAmountIn,
        address tokenOut,
        uint256 tokenAmountOut,
        uint256 maxPrice
    ) external returns (uint256 tokenAmountIn, uint256 spotPriceAfter);

    function calcOutGivenIn(
        uint256 tokenBalanceIn,
        uint256 tokenWeightIn,
        uint256 tokenBalanceOut,
        uint256 tokenWeightOut,
        uint256 tokenAmountIn,
        uint256 swapFee
    ) external view returns (uint256 tokenAmountOut);

    function calcInGivenOut(
        uint256 tokenBalanceIn,
        uint256 tokenWeightIn,
        uint256 tokenBalanceOut,
        uint256 tokenWeightOut,
        uint256 tokenAmountOut,
        uint256 swapFee
    ) external view returns (uint256 tokenAmountIn);

    function setSwapFee(uint256 swapFee) external;

    function setPublicSwap(bool publicSwap) external;

    function isPublicSwap() external view returns (bool);

    function getSwapFee() external view returns (uint256);

    function getController() external view returns (address);

    function getSpotPrice(address tokenIn, address tokenOut)
        external
        view
        returns (uint256);

    function getSpotPriceSansFee(address tokenIn, address tokenOut)
        external
        view
        returns (uint256);

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
