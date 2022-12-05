// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../../v1/dependencies/openzeppelin/IERC20.sol";
import "../../v1/dependencies/openzeppelin/ERC165Checker.sol";
import "../dependencies/openzeppelin/ERC4626.sol";
import "../interfaces/IAeraVaultV2.sol";
import "./brokers/PutOptionsBroker.sol";
import "./pricers/PutOptionsPricer.sol";
import "./IPutOptionsVault.sol";

contract PutOptionsVault is ERC4626, IPutOptionsVault {
    PutOptionsPricer private immutable _pricer;
    PutOptionsBroker private immutable _broker;
    IAeraVaultV2 private immutable _owner;

    address private _controller;
    address private _liquidator;

    error Aera__PricerAddressIsZero();
    error Aera__OwnerAddressIsZero();
    error Aera__ControllerAddressIsZero();
    error Aera__LiquidatorAddressIsZero();
    error Aera__BrokerAddressIsZero();
    error Aera__PutOptionsPricerIsNotValid(address pricer);
    error Aera__PutOptionsBrokerIsNotValid(address broker);
    error Aera__CallerIsNotBroker();
    error Aera__CallerIsNotLiquidator();
    error Aera__CallerIsNotController();

    modifier onlyBroker() {
        if (address(_broker) != msg.sender) revert Aera__CallerIsNotBroker();
        _;
    }

    modifier onlyController() {
        if (_controller != msg.sender) revert Aera__CallerIsNotController();
        _;
    }

    modifier onlyLiquidator() {
        if (_liquidator != msg.sender) revert Aera__CallerIsNotLiquidator();
        _;
    }

    constructor(
        address pricer,
        address owner_,
        address controller_,
        address liquidator_,
        address broker_,
        IERC20 asset,
        string memory name_,
        string memory symbol_
    ) ERC4626(asset) ERC20(name_, symbol_) {
        if (pricer == address(0)) revert Aera__PricerAddressIsZero();
        if (owner_ == address(0)) revert Aera__OwnerAddressIsZero();
        if (controller_ == address(0)) revert Aera__ControllerAddressIsZero();
        if (liquidator_ == address(0)) revert Aera__LiquidatorAddressIsZero();
        if (broker_ == address(0)) revert Aera__BrokerAddressIsZero();

        if (
            !ERC165Checker.supportsInterface(
                pricer,
                type(PutOptionsPricer).interfaceId
            )
        ) revert Aera__PutOptionsPricerIsNotValid(pricer);
        _pricer = PutOptionsPricer(pricer);

        if (
            !ERC165Checker.supportsInterface(
                broker_,
                type(PutOptionsBroker).interfaceId
            )
        ) revert Aera__PutOptionsBrokerIsNotValid(broker_);
        _broker = PutOptionsBroker(broker_);

        // TODO: check AeraVaultV2 compatibility via ERC165
        _owner = IAeraVaultV2(owner_);
        _controller = controller_;
        _liquidator = liquidator_;
    }

    function owner() external view returns (address) {
        return address(_owner);
    }

    function broker() external view returns (address) {
        return address(_broker);
    }

    function controller() external view returns (address) {
        return _controller;
    }

    function liquidator() external view returns (address) {
        return _liquidator;
    }
}
