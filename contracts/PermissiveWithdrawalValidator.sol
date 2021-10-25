// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

import "./dependencies/openzeppelin/ERC165.sol";
import { IWithdrawalValidator } from "./interfaces/IWithdrawalValidator.sol";

/// @notice A withdrawal validator that validates withdrawals of an arbitrary size.
contract PermissiveWithdrawalValidator is ERC165, IWithdrawalValidator {
    uint256 public constant ANY_AMOUNT = type(uint256).max;

    /// @inheritdoc IWithdrawalValidator
    function allowance() external pure override returns (uint256, uint256) {
        return (ANY_AMOUNT, ANY_AMOUNT);
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
