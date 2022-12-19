/**
 * SPDX-License-Identifier: UNLICENSED
 */
pragma solidity 0.8.11;

import "../../dependencies/gamma-protocol/OtokenInterface.sol";
import "../../dependencies/gamma-protocol/IOTokenController.sol";
import "../../dependencies/gamma-protocol/OracleInterface.sol";

/**
 * @dev Mock oTokenController
 *      THIS CONTRACT IS FOR TESTING PURPOSES ONLY. DO NOT USE IN PRODUCTION.
 */
contract MockOTokenController is IOTokenController {
    uint256 private _payout;
    bool private _canSettleAssets;
    OracleInterface private _oracle;

    constructor(OracleInterface oracle_) {
        _oracle = oracle_;
    }

    /**
     * @dev this function is used to test if controller can mint otokens
     */
    function testMintOtoken(
        address _otoken,
        address _account,
        uint256 _amount
    ) external {
        OtokenInterface(_otoken).mintOtoken(_account, _amount);
    }

    /**
     * @dev this function is used to test if controller can burn otokens
     */
    function testBurnOtoken(
        address _otoken,
        address _account,
        uint256 _amount
    ) external {
        OtokenInterface(_otoken).burnOtoken(_account, _amount);
    }

    function getPayout(
        address _otoken,
        uint256 _amount
    ) external view override returns (uint256) {}

    function canSettleAssets(
        address _underlying,
        address _strike,
        address _collateral,
        uint256 _expiry
    ) external view override returns (bool) {}

    function operate(Actions.ActionArgs[] memory _actions) external override {}

    function oracle() external view override returns (OracleInterface) {}
}
