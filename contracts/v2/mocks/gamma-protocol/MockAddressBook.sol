// solhint-disable no-empty-blocks
// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../../dependencies/gamma-protocol/AddressBookInterface.sol";

/**
 * @dev Mock AddressBook
 *      THIS CONTRACT IS FOR TESTING PURPOSES ONLY. DO NOT USE IN PRODUCTION.
 */
contract MockAddressBook is AddressBookInterface {
    address private _whitelist;
    address private _oTokenFactory;
    address private _controller;
    address private _oracle;

    function getOtokenImpl() external view override returns (address) {}

    function getOtokenFactory() external view override returns (address) {
        return _oTokenFactory;
    }

    function getWhitelist() external view override returns (address) {
        return _whitelist;
    }

    function getController() external view override returns (address) {
        return _controller;
    }

    function getOracle() external view override returns (address) {
        return _oracle;
    }

    function getMarginPool() external view override returns (address) {}

    function getMarginCalculator() external view override returns (address) {}

    function getLiquidationManager()
        external
        view
        override
        returns (address)
    {}

    function getAddress(bytes32 _id)
        external
        view
        override
        returns (address)
    {}

    function setOtokenImpl(address otokenImpl) external override {}

    function setOtokenFactory(address factory) external override {
        _oTokenFactory = factory;
    }

    function setOracleImpl(address oracle) external override {
        _oracle = oracle;
    }

    function setWhitelist(address whitelist) external override {
        _whitelist = whitelist;
    }

    function setController(address controller) external override {
        _controller = controller;
    }

    function setMarginPool(address _marginPool) external override {}

    function setMarginCalculator(address _calculator) external override {}

    function setLiquidationManager(address _liquidationManager)
        external
        override
    {}

    function setAddress(bytes32 _id, address _newImpl) external override {}
}
