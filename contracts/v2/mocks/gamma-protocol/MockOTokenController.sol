// SPDX-License-Identifier: UNLICENSED
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
    bool private _revertOnOperate;

    error RevertRequested();

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

    function getPayout(address, uint256)
        external
        view
        override
        returns (uint256)
    {
        return _payout;
    }

    function canSettleAssets(
        address,
        address,
        address,
        uint256
    ) external view override returns (bool) {
        return _canSettleAssets;
    }

    function setPayout(uint256 payout) external {
        _payout = payout;
    }

    function setCanSettleAssets(bool canSettleAssets_) external {
        _canSettleAssets = canSettleAssets_;
    }

    function setRevertOnOperate(bool revertOnOperate) external {
        _revertOnOperate = revertOnOperate;
    }

    function operate(Actions.ActionArgs[] memory) external override {
        if (_revertOnOperate) revert RevertRequested();
        _revertOnOperate = _revertOnOperate; // make compiler happy about "view"
    }

    function oracle() external view override returns (OracleInterface) {
        return _oracle;
    }
}
