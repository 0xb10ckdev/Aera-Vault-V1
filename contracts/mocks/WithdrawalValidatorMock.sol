// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

import "../dependencies/openzeppelin/Ownable.sol";
import "../dependencies/openzeppelin/IERC165.sol";
import "../interfaces/IWithdrawalValidator.sol";

/// @notice A withdrawal validator that validates withdrawals of an arbitrary size.
contract WithdrawalValidatorMock is IERC165, IWithdrawalValidator, Ownable {
    uint256 public allowance0;
    uint256 public allowance1;

    function setAllowance(uint256 amount0, uint256 amount1)
        external
        onlyOwner
    {
        allowance0 = amount0;
        allowance1 = amount1;
    }

    function allowance() external view override returns (uint256, uint256) {
        return (allowance0, allowance1);
    }

    function supportsInterface(bytes4 interfaceID)
        external
        view
        override
        returns (bool)
    {
        return interfaceID == type(IWithdrawalValidator).interfaceId;
    }
}
