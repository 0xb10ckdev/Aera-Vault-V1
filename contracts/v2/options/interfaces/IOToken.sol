// solhint-disable no-empty-blocks
// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../../dependencies/gamma-protocol/OtokenInterface.sol";
import "../../dependencies/openzeppelin/IERC20.sol";

interface IOToken is OtokenInterface, IERC20 {}
