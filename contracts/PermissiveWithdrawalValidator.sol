// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "./dependencies/openzeppelin/ERC165.sol";
import { IWithdrawalValidator } from "./interfaces/IWithdrawalValidator.sol";

/// @notice A withdrawal validator that validates withdrawals of an arbitrary size.
contract PermissiveWithdrawalValidator is ERC165, IWithdrawalValidator {
    uint256 public constant ANY_AMOUNT = type(uint256).max;
    uint8 public immutable count;

    constructor(uint8 tokenCount) {
        count = tokenCount;
    }

    /// @inheritdoc IWithdrawalValidator
    function allowance()
        external
        view
        override
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            amounts[i] = ANY_AMOUNT;
        }
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override
        returns (bool)
    {
        return
            interfaceId == type(IWithdrawalValidator).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
