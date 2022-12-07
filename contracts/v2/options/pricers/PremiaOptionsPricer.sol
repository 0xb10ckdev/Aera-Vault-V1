// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../../../v1/dependencies/openzeppelin/ERC165.sol";
import "./IPutOptionsPricer.sol";

contract PremiaOptionsPricer is ERC165, IPutOptionsPricer {
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
    ) external view override returns (uint256 premium) {}

    /// @inheritdoc IPutOptionsPricer
    function getSpot() external view override returns (uint256 spotPrice) {}
}
