// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../dependencies/openzeppelin/ERC165.sol";

/// @notice A withdrawal validator that validates withdrawals of an arbitrary size.
contract InvalidValidatorMock is ERC165 {
    // solhint-disable-next-line no-unused-vars
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override
        returns (bool)
    {
        return false;
    }
}
