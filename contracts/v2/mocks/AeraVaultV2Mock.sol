// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../AeraVaultV2.sol";

/**
 * @dev Mock AeraVaultV2 with getting spot prices.
 *      THIS CONTRACT IS FOR TESTING PURPOSES ONLY. DO NOT USE IN PRODUCTION.
 */
contract AeraVaultV2Mock is AeraVaultV2 {
    // solhint-disable no-empty-blocks
    constructor(
        NewVaultParams memory vaultParams,
        AggregatorV2V3Interface[] memory oracles,
        uint256 numeraireAssetIndex
    ) AeraVaultV2(vaultParams, oracles, numeraireAssetIndex) {}

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
        uint256[] memory weights = pool.getNormalizedWeights();

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
        uint256[] memory weights = pool.getNormalizedWeights();
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
}
