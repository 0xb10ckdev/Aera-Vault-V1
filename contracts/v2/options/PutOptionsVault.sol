// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../../v1/dependencies/openzeppelin/IERC20.sol";
import "../../v1/dependencies/openzeppelin/ERC165Checker.sol";
import "../../v1/dependencies/openzeppelin/Ownable.sol";
import "../dependencies/openzeppelin/Multicall.sol";
import "../dependencies/openzeppelin/ERC4626.sol";
import "./interfaces/IPutOptionsVault.sol";
import "./interfaces/IOToken.sol";
import "./pricers/IPutOptionsPricer.sol";

contract PutOptionsVault is ERC4626, Multicall, Ownable, IPutOptionsVault {
    using SafeERC20 for IERC20;

    uint256 private constant ONE = 10 ** 18;

    /// @notice minimum total value in USDC that can be used to purchase options
    uint256 private constant MIN_CHUNK_VALUE = 1 * 10 ** 7;

    /// @notice strike price discount measured off of current market price in bps
    uint256 private constant STRIKE_PRICE = 1 * 10 ** 7;

    /// @notice overall time to expiry for each purchased option
    uint256 private constant TIME_TO_EXPIRY = 30 days;

    IPutOptionsPricer private immutable _pricer;
    address private immutable _broker;
    address private immutable _controller;
    address private immutable _liquidator;
    IERC20 private immutable _underlyingOptionsAsset;

    SellOrder private _sellOrder;
    BuyOrder private _buyOrder;
    Range private _expiryDelta;
    Range private _strikeMultiplier;
    IOToken[] private _oTokens;

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
                type(IPutOptionsPricer).interfaceId
            )
        ) revert Aera__PutOptionsPricerIsNotValid(pricer_);

        _pricer = IPutOptionsPricer(pricer_);
        _broker = broker_;
        _controller = controller_;
        _liquidator = liquidator_;
        _underlyingOptionsAsset = underlyingOptionsAsset_;
    }

    /// @inheritdoc IPutOptionsVault
    function checkMaturity() external override returns (bool) {
        return _checkMaturity();
    }

    /// @inheritdoc IPutOptionsVault
    function sell(
        uint256 positionId,
        uint256 amount
    ) external override onlyLiquidator {
        IOToken oToken = _oTokens[positionId];

        //TODO: check if enough available to sell

        _sellOrder = SellOrder({
            active: true,
            oToken: address(oToken),
            amount: amount
        });

        emit SellOrderCreated(address(oToken), amount);
    }

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

    function _afterDeposit(uint256 assets, uint256 shares) internal override {
        uint256 balance = _underlyingOptionsAsset.balanceOf(address(this));

        if (balance < MIN_CHUNK_VALUE) return;

        uint256 spotPrice = _pricer.getSpot();

        uint64 minExpiryTimestamp = uint64(block.timestamp + _expiryDelta.min);
        uint64 maxExpiryTimestamp = uint64(block.timestamp + _expiryDelta.max);
        uint128 minStrikePrice = uint128(
            (spotPrice * _strikeMultiplier.min) / ONE
        );
        uint128 maxStrikePrice = uint128(
            (spotPrice * _strikeMultiplier.max) / ONE
        );

        _buyOrder = BuyOrder({
            active: true,
            minExpiryTimestamp: minExpiryTimestamp,
            maxExpiryTimestamp: maxExpiryTimestamp,
            minStrikePrice: minStrikePrice,
            maxStrikePrice: maxExpiryTimestamp,
            amount: balance
        });

        emit BuyOrderCreated(
            minExpiryTimestamp,
            maxExpiryTimestamp,
            minStrikePrice,
            maxStrikePrice,
            balance
        );
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
        returns (IOToken[] memory oTokenAddresses)
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
        return _underlyingOptionsAsset;
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
        IOToken oToken,
        uint256 amount
    ) external override onlyBroker whenBuyOrderActive returns (bool filled) {
        (
            address collateralAsset,
            address underlyingAsset,
            address strikeAsset,
            uint256 strikePrice,
            uint256 expiryTimestamp,
            bool isPut
        ) = oToken.getOtokenDetails();

        if (!isPut) return false;
        if (strikeAsset != address(_underlyingOptionsAsset)) return false;
        if (collateralAsset != address(_underlyingOptionsAsset)) return false;
        if (underlyingAsset != asset()) return false;
        if (
            _buyOrder.minExpiryTimestamp > expiryTimestamp ||
            _buyOrder.maxExpiryTimestamp < expiryTimestamp
        ) return false;
        if (
            _buyOrder.minStrikePrice > strikePrice ||
            _buyOrder.maxStrikePrice < strikePrice
        ) return false;

        uint256 premium = _pricer.getPremium(
            strikePrice,
            expiryTimestamp,
            isPut
        );

        SafeERC20.safeTransferFrom(
            oToken,
            msg.sender,
            address(this),
            _buyOrder.amount
        );
        SafeERC20.safeTransfer(IERC20(asset()), msg.sender, amount);

        _oTokens.push(oToken);
        delete _buyOrder;

        emit BuyOrderFilled(address(oToken), amount);

        return true;
    }

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
