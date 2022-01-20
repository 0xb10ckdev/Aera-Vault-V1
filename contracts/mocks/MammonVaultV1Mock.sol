// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../MammonVaultV1.sol";

/**
 * @dev Mock MammonVaultV1 with getting spot prices.
 *      THIS CONTRACT IS FOR TESTING PURPOSES ONLY. DO NOT USE IN PRODUCTION.
 */
contract MammonVaultV1Mock is MammonVaultV1 {
    uint256 private constant ONE = 10**18;

    // solhint-disable no-empty-blocks
    constructor(
        address factory,
        string memory name,
        string memory symbol,
        IERC20[] memory tokens,
        uint256[] memory weights,
        uint256 swapFeePercentage,
        address manager,
        address validator,
        uint32 noticePeriod,
        string memory description
    )
        MammonVaultV1(
            factory,
            name,
            symbol,
            tokens,
            weights,
            swapFeePercentage,
            manager,
            validator,
            noticePeriod,
            description
        )
    {}

    function getSpotPrice(address tokenIn, address tokenOut)
        external
        view
        returns (uint256)
    {
        if (tokenIn == tokenOut) {
            return ONE;
        }

        IERC20[] memory tokens;
        uint256[] memory holdings;
        (tokens, holdings, ) = getTokensData();
        uint256[] memory weights = getNormalizedWeights();

        uint256 tokenInId = type(uint256).max;
        uint256 tokenOutId = type(uint256).max;

        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokenIn == address(tokens[i])) {
                tokenInId = i;
                if (tokenOutId < type(uint256).max) {
                    break;
                }
            } else if (tokenOut == address(tokens[i])) {
                tokenOutId = i;
                if (tokenInId < type(uint256).max) {
                    break;
                }
            }
        }

        if (
            tokenInId == type(uint256).max || tokenOutId == type(uint256).max
        ) {
            return 0;
        }

        return
            calcSpotPrice(
                holdings[tokenInId],
                weights[tokenInId],
                holdings[tokenOutId],
                weights[tokenOutId],
                pool.getSwapFeePercentage()
            );
    }

    function getSpotPrices(address tokenIn)
        external
        view
        returns (uint256[] memory spotPrices)
    {
        IERC20[] memory tokens;
        uint256[] memory holdings;
        (tokens, holdings, ) = getTokensData();
        uint256[] memory weights = getNormalizedWeights();
        spotPrices = new uint256[](tokens.length);

        uint256 tokenInId = type(uint256).max;

        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokenIn == address(tokens[i])) {
                tokenInId = i;
                break;
            }
        }

        if (tokenInId < type(uint256).max) {
            uint256 swapFee = pool.getSwapFeePercentage();
            for (uint256 i = 0; i < tokens.length; i++) {
                if (i == tokenInId) {
                    spotPrices[i] = ONE;
                } else {
                    spotPrices[i] = calcSpotPrice(
                        holdings[tokenInId],
                        weights[tokenInId],
                        holdings[i],
                        weights[i],
                        swapFee
                    );
                }
            }
        }
    }

    /// INTERNAL FUNCTIONS ///

    /// @notice Calculate spot price from balances and weights.
    /// @dev Will only be called by getSpotPrice().
    /// @return Spot Price from balances and weights.
    function calcSpotPrice(
        uint256 tokenBalanceIn,
        uint256 tokenWeightIn,
        uint256 tokenBalanceOut,
        uint256 tokenWeightOut,
        uint256 swapFee
    ) internal pure returns (uint256) {
        uint256 numer = (tokenBalanceIn * ONE) / tokenWeightIn;
        uint256 denom = (tokenBalanceOut * ONE) / tokenWeightOut;
        uint256 ratio = (numer * ONE) / denom;
        uint256 scale = (ONE * ONE) / (ONE - swapFee);
        return (ratio * scale) / ONE;
    }
}
