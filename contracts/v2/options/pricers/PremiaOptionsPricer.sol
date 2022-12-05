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
}
