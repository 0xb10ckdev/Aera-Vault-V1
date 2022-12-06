// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../../v1/dependencies/openzeppelin/IERC20.sol";
import "../../v1/dependencies/openzeppelin/ERC165Checker.sol";
import "../../v1/dependencies/openzeppelin/Ownable.sol";
import "../dependencies/openzeppelin/Multicall.sol";
import "../dependencies/openzeppelin/ERC4626.sol";
import "./brokers/PutOptionsBroker.sol";
import "./pricers/PutOptionsPricer.sol";
import "./IPutOptionsVault.sol";

contract PutOptionsVault is ERC4626, Multicall, Ownable, IPutOptionsVault {
    uint256 private constant ONE = 10 ** 18;

    /// @notice minimum total value in USDC that can be used to purchase options
    uint256 private constant MIN_CHUNK_VALUE = 1 * 10 ** 7;

    /// @notice strike price discount measured off of current market price in bps
    uint256 private constant STRIKE_PRICE = 1 * 10 ** 7;

    /// @notice overall time to expiry for each purchased option
    uint256 private constant TIME_TO_EXPIRY = 30 days;

    PutOptionsPricer private immutable _pricer;
    address private immutable _broker;
    address private immutable _controller;
    address private immutable _liquidator;
    IERC20 private immutable _underlyingOptionAsset;

    SellOrder private _sellOrder;
    BuyOrder private _buyOrder;
    Range private _expiryDelta;
    Range private _strikeMultiplier;
    IERC20[] private _oTokens;
    Option[] private _options;

    /// MODIFIERS ///

    modifier onlyBroker() {
        if (_broker != msg.sender) revert Aera__CallerIsNotBroker();
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

    modifier whenBuyOrderActive() {
        if (!_buyOrder.active) revert Aera__BuyOrderIsNotActive();
        _;
    }

    modifier whenSellOrderActive() {
        if (!_sellOrder.active) revert Aera__SellOrderIsNotActive();
        _;
    }

    constructor(
        address controller_,
        address liquidator_,
        address broker_,
        address pricer_,
        IERC20 underlyingAsset_,
        IERC20 underlyingOptionsAsset_,
        string memory name_,
        string memory symbol_
    ) ERC4626(underlyingAsset_) ERC20(name_, symbol_) {
        if (pricer_ == address(0)) revert Aera__PricerAddressIsZero();
        if (controller_ == address(0)) revert Aera__ControllerAddressIsZero();
        if (liquidator_ == address(0)) revert Aera__LiquidatorAddressIsZero();
        if (broker_ == address(0)) revert Aera__BrokerAddressIsZero();
        if (address(underlyingOptionsAsset_) == address(0)) {
            revert Aera__UnderlyingOptionsAssetAddressIsZero();
        }
        if (
            !ERC165Checker.supportsInterface(
                pricer_,
                type(PutOptionsPricer).interfaceId
            )
        ) revert Aera__PutOptionsPricerIsNotValid(pricer_);

        _pricer = PutOptionsPricer(pricer_);
        _broker = broker_;
        _controller = controller_;
        _liquidator = liquidator_;
        _underlyingOptionAsset = underlyingOptionsAsset_;
    }

    /// @inheritdoc IPutOptionsVault
    function checkMaturity() external override returns (bool) {
        return _checkMaturity();
    }

    /// @inheritdoc IPutOptionsVault
    function sell(
        uint256 positionId,
        uint256 amount
    ) external override onlyLiquidator {}

    /// @inheritdoc IPutOptionsVault
    function setExpiryDelta(
        uint256 min,
        uint256 max
    ) external override onlyController {
        if (min > max) revert Aera__ExpiryDeltaRangeNotValid(min, max);

        _expiryDelta = Range(min, max);

        emit ExpiryDeltaChanged(min, max);
    }

    /// @inheritdoc IPutOptionsVault
    function setStrikeMultiplier(
        uint256 min,
        uint256 max
    ) external override onlyController {
        if (min > max) revert Aera__StrikeMultiplierRangeNotValid(min, max);
        if (min == 0) {
            revert Aera__StrikeMultiplierMinValueBelowExpected(min, 1);
        }
        if (max >= ONE) {
            revert Aera__StrikeMultiplierMaxValueExceedsExpected(max, ONE - 1);
        }

        _strikeMultiplier = Range(min, max);

        emit StrikeMultiplierChanged(min, max);
    }

    /// @inheritdoc ERC4626
    function maxDeposit(
        address receiver
    ) public view override(IERC4626, ERC4626) returns (uint256 maxAssets) {
        if (msg.sender != owner()) return 0;

        return super.maxDeposit(receiver);
    }

    /// @inheritdoc ERC4626
    function maxMint(
        address receiver
    ) public view override(ERC4626, IERC4626) returns (uint256 maxShares) {
        if (msg.sender != owner()) return 0;

        return super.maxMint(receiver);
    }

    /// @inheritdoc ERC4626
    function totalAssets()
        public
        view
        override(ERC4626, IERC4626)
        returns (uint256 result)
    {}

    /// @inheritdoc ERC4626
    function convertToShares(
        uint256 assets
    ) public view override(ERC4626, IERC4626) returns (uint256 shares) {}

    /// @inheritdoc ERC4626
    function convertToAssets(
        uint256 shares
    ) public view override(ERC4626, IERC4626) returns (uint256 assets) {}

    /// @inheritdoc IPutOptionsVault
    function broker() external view override returns (address) {
        return _broker;
    }

    /// @inheritdoc IPutOptionsVault
    function controller() external view override returns (address) {
        return _controller;
    }

    /// @inheritdoc IPutOptionsVault
    function liquidator() external view override returns (address) {
        return _liquidator;
    }

    /// @inheritdoc IPutOptionsVault
    function positions()
        external
        view
        override
        returns (IERC20[] memory oTokenAddresses)
    {
        return _oTokens;
    }

    /// @inheritdoc IPutOptionsVault
    function underlyingOptionsAsset()
        external
        view
        override
        returns (IERC20 underlyingOptionsAssetAddress)
    {
        return _underlyingOptionAsset;
    }

    /// @inheritdoc IPutOptionsVault
    function buyOrder() external view override returns (BuyOrder memory) {
        return _buyOrder;
    }

    /// @inheritdoc IPutOptionsVault
    function sellOrder() external view override returns (SellOrder memory) {
        return _sellOrder;
    }

    /// @inheritdoc IPutOptionsVault
    function fillBuyOrder(
        address oToken,
        uint256 amount
    ) external override onlyBroker whenBuyOrderActive returns (bool filled) {}

    /// @inheritdoc IPutOptionsVault
    function fillSellOrder(
        uint256 amount
    ) external override onlyBroker whenSellOrderActive returns (bool filled) {}

    /// @inheritdoc IPutOptionsVault
    function cancelBuyOrder() external override whenBuyOrderActive {
        //TODO: If a buy order has been active but unfilled for a given period of time MIN_ORDER_ACTIVE, anyone can remove (clean up) the order from the contract.
        emit BuyOrderCancelled(
            _buyOrder.minExpiryTimestamp,
            _buyOrder.maxExpiryTimestamp,
            _buyOrder.minStrikePrice,
            _buyOrder.maxStrikePrice,
            _buyOrder.amount
        );

        delete _buyOrder;
    }

    /// @inheritdoc IPutOptionsVault
    function cancelSellOrder() external override whenSellOrderActive {
        //TODO: If a sell order has been active but unfilled for a given period of time MIN_ORDER_ACTIVE, anyone can remove (clean up) the order from the contract.
        emit SellOrderCancelled(_sellOrder.oToken, _sellOrder.amount);

        delete _sellOrder;
    }

    function _beforeWithdraw(uint256, uint256) internal override {
        _checkMaturity();
    }

    function _checkMaturity() internal returns (bool) {}
}
