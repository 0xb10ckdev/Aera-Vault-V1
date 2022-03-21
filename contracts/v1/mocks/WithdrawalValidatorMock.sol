// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../dependencies/openzeppelin/Ownable.sol";
import "../dependencies/openzeppelin/ERC165.sol";
import "../interfaces/IWithdrawalValidator.sol";

/// @notice A withdrawal validator that validates withdrawals of an arbitrary size.
contract WithdrawalValidatorMock is ERC165, IWithdrawalValidator, Ownable {
    uint256[] public allowances;
    uint8 public immutable count;

    constructor(uint8 tokenCount) {
        count = tokenCount;
        allowances = new uint256[](tokenCount);
    }

    function setAllowance(uint256 index, uint256 amount) external onlyOwner {
        allowances[index] = amount;
    }

    function setAllowances(uint256[] calldata amounts) external onlyOwner {
        allowances = amounts;
    }

    function allowance() external view override returns (uint256[] memory) {
        return allowances;
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
