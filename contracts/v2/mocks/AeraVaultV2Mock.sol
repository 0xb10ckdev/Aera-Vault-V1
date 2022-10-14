// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../AeraVaultV2.sol";

/**
 * @dev Mock AeraVaultV2 with getting spot prices.
 *      THIS CONTRACT IS FOR TESTING PURPOSES ONLY. DO NOT USE IN PRODUCTION.
 */
contract AeraVaultV2Mock is AeraVaultV2 {
    // solhint-disable no-empty-blocks
    constructor(NewVaultParams memory vaultParams) AeraVaultV2(vaultParams) {}

    function getSpotPrice(address tokenIn, address tokenOut)
        external
        view
        returns (uint256)
    {
        if (tokenIn == tokenOut) {
            return ONE;
        }

        IERC20[] memory poolTokens;
        uint256[] memory poolHoldings;
        (poolTokens, poolHoldings, ) = getPoolTokensData();
        uint256[] memory weights = pool.getNormalizedWeights();

        uint256 tokenInId = type(uint256).max;
        uint256 tokenOutId = type(uint256).max;

        for (uint256 i = 0; i < poolTokens.length; i++) {
            if (tokenIn == address(poolTokens[i])) {
                tokenInId = i;
                if (tokenOutId < type(uint256).max) {
                    break;
                }
            } else if (tokenOut == address(poolTokens[i])) {
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
                poolHoldings[tokenInId],
                weights[tokenInId],
                poolHoldings[tokenOutId],
                weights[tokenOutId],
                pool.getSwapFeePercentage()
            );
    }

    function getSpotPrices(address tokenIn)
        external
        view
        returns (uint256[] memory spotPrices)
    {
        IERC20[] memory poolTokens;
        uint256[] memory poolHoldings;
        (poolTokens, poolHoldings, ) = getPoolTokensData();
        uint256[] memory weights = pool.getNormalizedWeights();
        spotPrices = new uint256[](poolTokens.length);

        uint256 tokenInId = type(uint256).max;

        for (uint256 i = 0; i < poolTokens.length; i++) {
            if (tokenIn == address(poolTokens[i])) {
                tokenInId = i;
                break;
            }
        }

        if (tokenInId < type(uint256).max) {
            uint256 swapFee = pool.getSwapFeePercentage();
            for (uint256 i = 0; i < poolTokens.length; i++) {
                if (i == tokenInId) {
                    spotPrices[i] = ONE;
                } else {
                    spotPrices[i] = calcSpotPrice(
                        poolHoldings[tokenInId],
                        weights[tokenInId],
                        poolHoldings[i],
                        weights[i],
                        swapFee
                    );
                }
            }
        }
    }
}
