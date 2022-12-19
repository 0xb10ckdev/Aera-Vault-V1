// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../dependencies/openzeppelin/ERC165.sol";
import "../options/pricers/IPutOptionsPricer.sol";

/**
 * @dev Mock PutOptionsPricer
 *      THIS CONTRACT IS FOR TESTING PURPOSES ONLY. DO NOT USE IN PRODUCTION.
 */
contract PutOptionsPricerMock is ERC165, IPutOptionsPricer {
    uint256 private _premium;
    uint256 private _spot;
    uint8 private _decimals = 8;

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC165, IERC165) returns (bool) {
        return
            type(IPutOptionsPricer).interfaceId == interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /// @inheritdoc IPutOptionsPricer
    function getPremium(
        uint256 strikePrice,
        uint256 expiryTimestamp,
        bool isPut
    ) external view override returns (uint256) {
        return _premium;
    }

    /// @inheritdoc IPutOptionsPricer
    function getSpot() external view override returns (uint256) {
        return _spot;
    }

    /// @inheritdoc IPutOptionsPricer
    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function setPremium(uint256 premium) external {
        _premium = premium;
    }

    function setSpot(uint256 spot) external {
        _spot = spot;
    }

    function setDecimals(uint8 decimals_) external {
        _decimals = decimals_;
    }
}
