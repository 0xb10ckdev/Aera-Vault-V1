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

    function setPremium(uint256 premium) external {
        _premium = premium;
    }

    function setSpot(uint256 spot) external {
        _spot = spot;
    }
}
