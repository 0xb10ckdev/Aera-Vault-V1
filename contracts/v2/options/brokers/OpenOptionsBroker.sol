// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../../dependencies/openzeppelin/ERC165.sol";
import "./IPutOptionsBroker.sol";

contract OpenOptionsBroker is ERC165, IPutOptionsBroker {
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC165, IERC165)
        returns (bool)
    {
        return
            type(IPutOptionsBroker).interfaceId == interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
