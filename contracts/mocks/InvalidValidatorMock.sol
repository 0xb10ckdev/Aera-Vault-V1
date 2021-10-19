// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

import "../dependencies/openzeppelin/IERC165.sol";

/// @notice A withdrawal validator that validates withdrawals of an arbitrary size.
contract InvalidValidatorMock is IERC165 {
    function supportsInterface(bytes4 interfaceID)
        external
        view
        override
        returns (bool)
    {
        return false;
    }
}
