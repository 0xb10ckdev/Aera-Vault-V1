// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

library Decimals {
    function adjust(
        uint256 value,
        uint256 valueDecimals,
        uint256 targetDecimals
    ) internal pure returns (uint256) {
        if (valueDecimals == targetDecimals) return value;
        if (valueDecimals < targetDecimals) {
            return value * (10**(targetDecimals - valueDecimals));
        }

        return value / (10**(valueDecimals - targetDecimals));
    }
}
