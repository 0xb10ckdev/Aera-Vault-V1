// solhint-disable no-empty-blocks
// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../dependencies/premia/oracle/IVolatilitySurfaceOracle.sol";
import "../dependencies/abdk/ABDKMath64x64.sol";

/**
 * @dev Mock VolatilitySurfaceOracle
 *      THIS CONTRACT IS FOR TESTING PURPOSES ONLY. DO NOT USE IN PRODUCTION.
 */
contract MockVolatilitySurfaceOracle is IVolatilitySurfaceOracle {
    int128 private _blackSholesPrice64x64;

    function formatParams(int256[5] memory params)
        external
        pure
        override
        returns (bytes32 result)
    {}

    function parseParams(bytes32 input)
        external
        pure
        override
        returns (int256[] memory params)
    {}

    function getWhitelistedRelayers()
        external
        view
        override
        returns (address[] memory)
    {}

    function getParamsUnpacked(address base, address underlying)
        external
        view
        override
        returns (int256[] memory)
    {}

    function getTimeToMaturity64x64(uint64 maturity)
        external
        view
        override
        returns (int128)
    {
        return ABDKMath64x64.divu(maturity - block.timestamp, 365 days);
    }

    function getAnnualizedVolatility64x64(
        address base,
        address underlying,
        int128 spot64x64,
        int128 strike64x64,
        int128 timeToMaturity64x64
    ) external view override returns (int128) {}

    function getBlackScholesPrice64x64(
        address,
        address,
        int128,
        int128,
        int128,
        bool
    ) external view override returns (int128) {
        return _blackSholesPrice64x64;
    }

    function getBlackScholesPrice(
        address base,
        address underlying,
        int128 spot64x64,
        int128 strike64x64,
        int128 timeToMaturity64x64,
        bool isCall
    ) external view override returns (uint256) {}

    function addWhitelistedRelayers(address[] memory accounts)
        external
        override
    {}

    function removeWhitelistedRelayers(address[] memory accounts)
        external
        override
    {}

    function updateParams(
        address[] memory base,
        address[] memory underlying,
        bytes32[] memory parameters
    ) external override {}

    function setBlackScholesPrice64x64(int128 blackSholesPrice64x64) external {
        _blackSholesPrice64x64 = blackSholesPrice64x64;
    }
}
