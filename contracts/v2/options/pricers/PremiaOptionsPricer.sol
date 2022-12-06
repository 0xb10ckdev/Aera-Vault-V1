// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../../../v1/dependencies/openzeppelin/ERC165.sol";
import "./PutOptionsPricer.sol";

contract PremiaOptionsPricer is ERC165, PutOptionsPricer {
    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC165, IERC165) returns (bool) {
        return
            type(PutOptionsPricer).interfaceId == interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function getPremium(
        uint256 strikePrice,
        uint256 expiryTimestamp,
        bool isPut
    ) external view override returns (uint256 premium) {}

    function getSpot() external view override returns (uint256 spotPrice) {}
}
