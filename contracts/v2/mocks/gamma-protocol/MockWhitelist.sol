/**
 * SPDX-License-Identifier: UNLICENSED
 */
pragma solidity 0.8.11;

import "../../dependencies/gamma-protocol/WhitelistInterface.sol";

/**
 * @dev Mock Whitelist
 *      THIS CONTRACT IS FOR TESTING PURPOSES ONLY. DO NOT USE IN PRODUCTION.
 */

contract MockWhitelist is WhitelistInterface {
    mapping(address => bool) private _whitelistedTokens;

    function addressBook() external view override returns (address) {}

    function isWhitelistedProduct(
        address _underlying,
        address _strike,
        address _collateral,
        bool _isPut
    ) external view override returns (bool) {}

    function isWhitelistedCollateral(
        address _collateral
    ) external view override returns (bool) {}

    function isWhitelistedOtoken(
        address _otoken
    ) external view override returns (bool) {
        return _whitelistedTokens[_otoken];
    }

    function isWhitelistedCallee(
        address _callee
    ) external view override returns (bool) {}

    function whitelistProduct(
        address _underlying,
        address _strike,
        address _collateral,
        bool _isPut
    ) external override {}

    function blacklistProduct(
        address _underlying,
        address _strike,
        address _collateral,
        bool _isPut
    ) external override {}

    function whitelistCollateral(address _collateral) external override {}

    function blacklistCollateral(address _collateral) external override {}

    function whitelistOtoken(address _otoken) external override {
        _whitelistedTokens[_otoken] = true;
    }

    function blacklistOtoken(address _otoken) external override {
        _whitelistedTokens[_otoken] = false;
    }

    function whitelistCallee(address _callee) external override {}

    function blacklistCallee(address _callee) external override {}
}
