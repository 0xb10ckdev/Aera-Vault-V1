// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "./dependencies/openzeppelin/ERC165Checker.sol";
import "./interfaces/IWithdrawalValidator.sol";

contract ValidatorChecker {
    error Aera__ValidatorIsNotValid();

    constructor() {
        if (
            !ERC165Checker.supportsInterface(
                0xFa60a31d9a684795af7E8c2F5E35eC1C5fA5a84B,
                type(IWithdrawalValidator).interfaceId
            )
        ) {
            revert("REASON");
        }
    }
}
