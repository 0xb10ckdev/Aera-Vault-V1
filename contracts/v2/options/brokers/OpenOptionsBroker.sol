// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../../../v1/dependencies/openzeppelin/ERC165.sol";
import "./PutOptionsBroker.sol";

contract OpenOptionsBroker is ERC165, PutOptionsBroker {
    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC165, IERC165) returns (bool) {
        return
            type(PutOptionsBroker).interfaceId == interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
