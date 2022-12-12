// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../../v1/dependencies/openzeppelin/IERC20.sol";
import "../../v1/dependencies/openzeppelin/ERC165Checker.sol";
import "../../v1/dependencies/openzeppelin/Ownable.sol";
import "../../v1/dependencies/openzeppelin/EnumerableSet.sol";
import "../dependencies/openzeppelin/Multicall.sol";
import "../dependencies/openzeppelin/ERC4626.sol";
import "../dependencies/gamma-protocol/IOTokenController.sol";
import "../dependencies/gamma-protocol/Actions.sol";
import "./interfaces/IPutOptionsVault.sol";
import "./interfaces/IOToken.sol";
import "./pricers/IPutOptionsPricer.sol";

contract PutOptionsVault is ERC4626, Multicall, Ownable, IPutOptionsVault {
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;

    uint256 private constant ONE = 10 ** 18;

    /// @notice Minimum total value in USDC that can be used to purchase options
    uint256 private constant MIN_CHUNK_VALUE = 1 * 10 ** 7;

    /// @notice Strike price discount measured off of current market price in bps
    uint256 private constant STRIKE_PRICE = 1 * 10 ** 7;

    /// @notice Overall time to expiry for each purchased option
    uint256 private constant TIME_TO_EXPIRY = 30 days;

    /// @notice Time for a broker to fill buy/sell order.
    ///         After that period anyone can cancel order.
    uint256 private constant MIN_ORDER_ACTIVE = 3 days;

    /// @notice oToken base (8 decimals)
    uint256 private constant O_TOKEN_BASE = 10 ** 8;

    IPutOptionsPricer private immutable _pricer;
    address private immutable _broker;
    address private immutable _controller;
    address private immutable _liquidator;
    /// @notice Underlying asset for Opyn option (namely WETH)
    IERC20 private immutable _underlyingOptionsAsset;

    SellOrder private _sellOrder;
    BuyOrder private _buyOrder;
    Range private _expiryDelta;
    Range private _strikeMultiplier;

    /// @notice Discount for option premium, when buying/selling option from/to the broker
    uint256 private _optionPremiumDiscount = 0.05 * 10 ** 18;

    /// @notice ITM option price ratio which is applied after option is expired, but before
    ///         price is finalized
    uint256 private _itmOptionPriceRatio = 0.8 * 10 ** 18;
    EnumerableSet.AddressSet private _oTokens;

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
        if (pricer_ == address(0)) revert Aera__PricerIsZeroAddress();
        if (controller_ == address(0)) revert Aera__ControllerIsZeroAddress();
        if (liquidator_ == address(0)) revert Aera__LiquidatorIsZeroAddress();
        if (broker_ == address(0)) revert Aera__BrokerIsZeroAddress();
        if (address(underlyingOptionsAsset_) == address(0)) {
            revert Aera__UnderlyingOptionsAssetIsZeroAddress();
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
    function checkExpired() external override returns (bool) {
        return _checkExpired();
    }

    /// @inheritdoc IPutOptionsVault
    function sell(
        address oToken,
        uint256 amount
    ) external override onlyLiquidator {
        if (!_oTokens.contains(oToken)) revert Aera__UnknownOToken(oToken);

        uint256 balance = IOToken(oToken).balanceOf(address(this));
        if (balance < amount) {
            revert Aera__InsufficientBalanceToSell(amount, balance);
        }

        _sellOrder = SellOrder({
            active: true,
            oToken: oToken,
            created: uint64(block.timestamp),
            amount: amount
        });

        emit SellOrderCreated(oToken, amount);
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
        uint256 balance = asset().balanceOf(address(this));

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
            created: uint64(block.timestamp),
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

    /// @inheritdoc IPutOptionsVault
    function fillBuyOrder(
        address oToken,
        uint256 amount
    ) external override onlyBroker whenBuyOrderActive returns (bool) {
        (
            address collateralAsset,
            address underlyingAsset,
            address strikeAsset,
            uint256 strikePrice,
            uint256 expiryTimestamp,
            bool isPut
        ) = IOToken(oToken).getOtokenDetails();

        if (!isPut) return false;
        if (underlyingAsset != address(_underlyingOptionsAsset)) return false;
        if (collateralAsset != asset()) return false;
        if (strikeAsset != asset()) return false;

        BuyOrder memory order = _buyOrder;
        if (
            order.minExpiryTimestamp > expiryTimestamp ||
            order.maxExpiryTimestamp < expiryTimestamp
        ) return false;
        if (
            order.minStrikePrice > strikePrice ||
            order.maxStrikePrice < strikePrice
        ) return false;

        // _buyOrder is deleted to prevent reentrancy
        delete _buyOrder;

        uint256 premium = (_pricer.getPremium(
            strikePrice,
            expiryTimestamp,
            isPut
        ) * order.amount) / O_TOKEN_BASE;

        uint256 premiumWithDiscount = (premium *
            (ONE + _optionPremiumDiscount)) / ONE;

        if (premiumWithDiscount < amount) {
            revert Aera__OrderPremiumTooExpensive(premiumWithDiscount, amount);
        }

        SafeERC20.safeTransferFrom(
            IOToken(oToken),
            msg.sender,
            address(this),
            order.amount
        );
        SafeERC20.safeTransfer(IERC20(asset()), msg.sender, amount);

        _oTokens.add(oToken);

        emit BuyOrderFilled(oToken, amount);

        return true;
    }

    /// @inheritdoc IPutOptionsVault
    function fillSellOrder(
        uint256 amount
    ) external override onlyBroker whenSellOrderActive returns (bool filled) {
        SellOrder memory order = _sellOrder;
        // _sellOrder is deleted to prevent reentrancy
        delete _sellOrder;

        IOToken oToken = IOToken(order.oToken);
        (
            address collateralAsset,
            address underlyingAsset,
            address strikeAsset,
            uint256 strikePrice,
            uint256 expiryTimestamp,
            bool isPut
        ) = oToken.getOtokenDetails();

        uint256 premium = (_pricer.getPremium(
            strikePrice,
            expiryTimestamp,
            isPut
        ) * order.amount) / O_TOKEN_BASE;

        uint256 premiumWithDiscount = (premium *
            (ONE - _optionPremiumDiscount)) / ONE;

        if (amount < premiumWithDiscount) {
            revert Aera__OrderPremiumTooCheap(premiumWithDiscount, amount);
        }

        SafeERC20.safeTransferFrom(
            IERC20(asset()),
            msg.sender,
            address(this),
            amount
        );

        SafeERC20.safeTransfer(oToken, msg.sender, order.amount);

        if (oToken.balanceOf(address(this)) == 0) {
            _oTokens.remove(address(oToken));
        }

        emit SellOrderFilled(address(oToken), amount);

        return true;
    }

    /// @inheritdoc IPutOptionsVault
    function cancelBuyOrder() external override whenBuyOrderActive {
        if (
            block.timestamp - _buyOrder.created < MIN_ORDER_ACTIVE &&
            msg.sender != _broker
        ) revert Aera__CallerIsNotBroker();

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
        if (
            block.timestamp - _sellOrder.created < MIN_ORDER_ACTIVE &&
            msg.sender != _broker
        ) revert Aera__CallerIsNotBroker();

        emit SellOrderCancelled(_sellOrder.oToken, _sellOrder.amount);

        delete _sellOrder;
    }

    /// @inheritdoc IPutOptionsVault
    function setOptionPremiumDiscount(
        uint256 discount
    ) external override onlyController {
        if (discount > ONE) {
            revert Aera__DiscountExceedsMaximumValue(discount, ONE);
        }

        _optionPremiumDiscount = discount;

        emit OptionPremiumDiscountChanged(discount);
    }

    /// @inheritdoc IPutOptionsVault
    function setITMOptionPriceRatio(
        uint256 ratio
    ) external override onlyController {
        _itmOptionPriceRatio = ratio;

        emit ITMOptionPriceRatioChanged(ratio);
    }

    /// @inheritdoc ERC4626
    function totalAssets()
        public
        view
        override(ERC4626, IERC4626)
        returns (uint256 result)
    {
        uint256 n = _oTokens.length();

        for (uint256 i = 0; i < n; i++) {
            result += _getOptionPrice(IOToken(_oTokens.at(i)));
        }

        return result + asset().balanceOf(address(this));
    }

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
        returns (address[] memory oTokenAddresses)
    {
        return _oTokens.values();
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
    function expiryDelta()
        external
        view
        override
        returns (uint256 min, uint256 max)
    {
        return (_expiryDelta.min, _expiryDelta.max);
    }

    /// @inheritdoc IPutOptionsVault
    function strikeMultiplier()
        external
        view
        override
        returns (uint256 min, uint256 max)
    {
        return (_strikeMultiplier.min, _strikeMultiplier.max);
    }

    /// @inheritdoc IPutOptionsVault
    function optionsPremiumDiscount()
        external
        view
        override
        returns (uint256 discount)
    {
        return _optionPremiumDiscount;
    }

    /// @inheritdoc IPutOptionsVault
    function itmOptionPriceRatio() external view returns (uint256 ratio) {
        return _itmOptionPriceRatio;
    }

    function _beforeWithdraw(uint256, uint256) internal override {
        _checkExpired();
    }

    function _checkExpired() internal returns (bool optionsMatured) {
        // Copy the tokens array and iterate over it
        // so not to handle unexpected reorderings in _oTokens
        // when oToken is removed
        address[] memory tokens = _oTokens.values();
        for (uint256 i = 0; i < tokens.length; i++) {
            IOToken oToken = IOToken(tokens[i]);

            // controller will check for expiration and finalized
            // oracle price and revert when option is not redeemable
            try
                IOTokenController(oToken.controller()).operate(
                    _createRedeemAction(oToken)
                )
            {
                optionsMatured = true;
                _oTokens.remove(address(oToken));
            } catch {}
        }
    }

    function _getOptionPrice(IOToken oToken) internal view returns (uint256) {
        // 3 possible ways
        // 1. oToken is not expired => pricer is used to estimate option price
        // 2. oToken is expired, but oracle price is not finalized => apply _itmOptionPriceRatio to option price
        // 3. oToken is expired and oracle price is finalized => option value is known
        (
            address collateralAsset,
            address underlyingAsset,
            address strikeAsset,
            uint256 strikePrice,
            uint256 expiryTimestamp,
            bool isPut
        ) = oToken.getOtokenDetails();

        if (block.timestamp < expiryTimestamp) {
            // 1
            return
                (_pricer.getPremium(strikePrice, expiryTimestamp, isPut) *
                    oToken.balanceOf(address(this))) / O_TOKEN_BASE;
        }

        IOTokenController oTokenController = IOTokenController(
            oToken.controller()
        );
        if (
            oTokenController.canSettleAssets(
                underlyingAsset,
                strikeAsset,
                collateralAsset,
                expiryTimestamp
            )
        ) {
            // 3
            return
                oTokenController.getPayout(
                    address(oToken),
                    oToken.balanceOf(address(this))
                );
        }
        // 2
        (uint256 price, ) = oTokenController.oracle().getExpiryPrice(
            underlyingAsset,
            expiryTimestamp
        );

        if (price < strikePrice) {
            return (((((strikePrice - price) * _itmOptionPriceRatio) / ONE) *
                oToken.balanceOf(address(this))) / O_TOKEN_BASE);
        }

        return 0;
    }

    // Reference: https://opyn.gitbook.io/opyn/get-started/actions#redeem
    // Example: https://github.com/opynfinance/GammaProtocol/blob/master/test/integration-tests/nakedPutExpireITM.test.ts#L272
    function _createRedeemAction(
        IOToken oToken
    ) internal view returns (Actions.ActionArgs[] memory) {
        Actions.ActionArgs[] memory actions = new Actions.ActionArgs[](1);
        actions[0] = Actions.ActionArgs({
            actionType: Actions.ActionType.Redeem,
            owner: address(0),
            secondAddress: address(this),
            asset: address(oToken),
            vaultId: 0,
            amount: oToken.balanceOf(address(this)),
            index: 0,
            data: ""
        });
        return actions;
    }
}
