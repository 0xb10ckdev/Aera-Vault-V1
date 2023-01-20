// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../dependencies/openzeppelin/EnumerableSet.sol";
import "../dependencies/openzeppelin/Multicall.sol";
import "../dependencies/openzeppelin/ERC165Checker.sol";
import "../dependencies/openzeppelin/IERC20.sol";
import "../dependencies/openzeppelin/ERC4626.sol";
import "../dependencies/openzeppelin/Ownable.sol";
import "../dependencies/gamma-protocol/IOTokenController.sol";
import "../dependencies/gamma-protocol/Actions.sol";
import "../dependencies/gamma-protocol/AddressBookInterface.sol";
import "../dependencies/gamma-protocol/WhitelistInterface.sol";
import "./interfaces/IPutOptionsVault.sol";
import "./interfaces/IOToken.sol";
import "./pricers/IPutOptionsPricer.sol";
import "./Decimals.sol";

contract PutOptionsVault is ERC4626, Multicall, Ownable, IPutOptionsVault {
    using Math for uint256;
    using Decimals for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;

    uint256 private constant _ONE = 10**18;
    uint8 private constant _O_TOKEN_DECIMALS = 8;

    bool private constant _BUY_O_TOKEN = true;
    bool private constant _SELL_O_TOKEN = false;

    /// @notice Minimum total value in vault underlying asset terms (e.g., USDC) that can be used to purchase options
    uint256 private immutable _minChunkValue;

    /// @notice Period of time for a broker to fill buy/sell order.
    ///         After that period order can be cancelled by anyone.
    uint256 private immutable _maxOrderActive;

    IPutOptionsPricer private immutable _pricer;
    address private immutable _broker;
    address private immutable _controller;
    address private immutable _liquidator;
    /// @notice Underlying asset for Opyn option (for example WETH)
    address private immutable _underlyingOptionsAsset;
    address private immutable _opynAddressBook;
    uint8 private immutable _pricerDecimals;

    /// @notice Discount for option premium, when buying/selling option from/to the broker
    uint256 private _optionPremiumRatio = 0.95 * 10**18;

    /// @notice ITM option price ratio which is applied after option is expired, but before
    ///         price is finalized
    uint256 private _itmOptionPriceRatio = 0.99 * 10**18;
    SellOrder private _sellOrder;
    BuyOrder private _buyOrder;
    Range private _expiryDelta;
    Range private _strikeMultiplier;
    EnumerableSet.AddressSet private _oTokens;

    /// MODIFIERS ///

    modifier onlyBroker() {
        if (_broker != msg.sender) revert AeraPOV__CallerIsNotBroker();
        _;
    }

    modifier onlyController() {
        if (_controller != msg.sender) revert AeraPOV__CallerIsNotController();
        _;
    }

    modifier onlyLiquidator() {
        if (_liquidator != msg.sender) revert AeraPOV__CallerIsNotLiquidator();
        _;
    }

    modifier whenBuyOrderActive() {
        if (!_buyOrder.active) revert AeraPOV__BuyOrderIsNotActive();
        _;
    }

    modifier whenSellOrderActive() {
        if (!_sellOrder.active) revert AeraPOV__SellOrderIsNotActive();
        _;
    }

    constructor(ConstructorArgs memory args)
        ERC4626(IERC20(args.underlyingAsset))
        ERC20(args.name, args.symbol)
    {
        if (args.controller == address(0)) {
            revert AeraPOV__ControllerIsZeroAddress();
        }
        if (args.liquidator == address(0)) {
            revert AeraPOV__LiquidatorIsZeroAddress();
        }
        if (args.broker == address(0)) revert AeraPOV__BrokerIsZeroAddress();
        if (args.opynAddressBook == address(0)) {
            revert AeraPOV__OpynAddressBookIsZeroAddress();
        }
        if (args.underlyingAsset == address(0)) {
            revert AeraPOV__UnderlyingAssetIsZeroAddress();
        }
        if (args.underlyingOptionsAsset == address(0)) {
            revert AeraPOV__UnderlyingOptionsAssetIsZeroAddress();
        }
        if (
            !ERC165Checker.supportsInterface(
                args.pricer,
                type(IPutOptionsPricer).interfaceId
            )
        ) {
            revert AeraPOV__PutOptionsPricerIsNotValid(args.pricer);
        }

        _pricer = IPutOptionsPricer(args.pricer);
        _pricerDecimals = _pricer.decimals();
        _broker = args.broker;
        _controller = args.controller;
        _liquidator = args.liquidator;
        _underlyingOptionsAsset = args.underlyingOptionsAsset;
        _opynAddressBook = args.opynAddressBook;
        _setExpiryDelta(args.expiryDelta.min, args.expiryDelta.max);
        _setStrikeMultiplier(
            args.strikeMultiplier.min,
            args.strikeMultiplier.max
        );
        _minChunkValue = args.minChunkValue;
        _maxOrderActive = args.maxOrderActive;
    }

    /// @inheritdoc IPutOptionsVault
    function checkExpired() external override returns (bool) {
        return _checkExpired();
    }

    /// @inheritdoc IPutOptionsVault
    function sell(address oToken, uint256 amount)
        external
        override
        onlyLiquidator
    {
        if (!_oTokens.contains(oToken)) revert AeraPOV__UnknownOToken(oToken);

        uint256 balance = IERC20(oToken).balanceOf(address(this));
        if (amount > balance) {
            revert AeraPOV__InsufficientBalanceToSell(amount, balance);
        }

        if (_sellOrder.active) {
            _cancelSellOrder();
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
    function setExpiryDelta(uint256 min, uint256 max)
        external
        override
        onlyController
    {
        _setExpiryDelta(min, max);
    }

    /// @inheritdoc IPutOptionsVault
    function setStrikeMultiplier(uint256 min, uint256 max)
        external
        override
        onlyController
    {
        _setStrikeMultiplier(min, max);
    }

    /// @inheritdoc IPutOptionsVault
    function fillBuyOrder(address oToken, uint256 amount)
        external
        override
        onlyBroker
        whenBuyOrderActive
    {
        BuyOrder memory order = _buyOrder;
        // _buyOrder is deleted first to prevent reentrancy
        delete _buyOrder;

        _verifyWhitelisted(oToken);

        (
            address collateralAsset,
            address underlyingAsset,
            address strikeAsset,
            uint256 strikePrice,
            uint256 expiryTimestamp,
            bool isPut
        ) = IOToken(oToken).getOtokenDetails();

        _verifyParameterMatch(
            order,
            collateralAsset,
            underlyingAsset,
            strikeAsset,
            strikePrice,
            expiryTimestamp,
            isPut
        );

        uint256 required = _estimateOTokenAmount(
            strikePrice,
            expiryTimestamp,
            order.underlyingAssetAmount,
            _BUY_O_TOKEN
        );

        if (amount < required) {
            revert AeraPOV__NotEnoughOTokens(required, amount);
        }

        _oTokens.add(oToken);

        emit BuyOrderFilled(oToken, amount);

        SafeERC20.safeTransferFrom(
            IERC20(oToken),
            msg.sender,
            address(this),
            amount
        );
        SafeERC20.safeTransfer(
            IERC20(asset()),
            msg.sender,
            order.underlyingAssetAmount
        );
    }

    /// @inheritdoc IPutOptionsVault
    function fillSellOrder(uint256 amount)
        external
        override
        onlyBroker
        whenSellOrderActive
    {
        SellOrder memory order = _sellOrder;
        // _sellOrder is deleted first to prevent reentrancy
        delete _sellOrder;

        address oToken = order.oToken;
        (, , , uint256 strikePrice, uint256 expiryTimestamp, ) = IOToken(
            oToken
        ).getOtokenDetails();

        uint256 tokens = _estimateOTokenAmount(
            strikePrice,
            expiryTimestamp,
            amount,
            _SELL_O_TOKEN
        );

        if (order.amount > tokens) {
            revert AeraPOV__NotEnoughAssets(amount);
        }

        emit SellOrderFilled(oToken, amount);

        // slither-disable-next-line incorrect-equality
        if (IERC20(oToken).balanceOf(address(this)) - order.amount == 0) {
            _oTokens.remove(oToken);
        }

        SafeERC20.safeTransferFrom(
            IERC20(asset()),
            msg.sender,
            address(this),
            amount
        );

        SafeERC20.safeTransfer(IERC20(oToken), msg.sender, order.amount);
    }

    /// @inheritdoc IPutOptionsVault
    function cancelBuyOrder() external override whenBuyOrderActive {
        if (
            block.timestamp - _buyOrder.created < _maxOrderActive &&
            msg.sender != _broker
        ) revert AeraPOV__CallerIsNotBroker();

        _cancelBuyOrder();
    }

    /// @inheritdoc IPutOptionsVault
    function cancelSellOrder() external override whenSellOrderActive {
        if (
            block.timestamp - _sellOrder.created < _maxOrderActive &&
            msg.sender != _broker
        ) revert AeraPOV__CallerIsNotBroker();

        _cancelSellOrder();
    }

    /// @inheritdoc IPutOptionsVault
    function setOptionPremiumRatio(uint256 ratio)
        external
        override
        onlyController
    {
        if (ratio == 0) revert AeraPOV__OptionPremiumRatioIsZero();

        _optionPremiumRatio = ratio;
        emit OptionPremiumRatioChanged(ratio);
    }

    /// @inheritdoc IPutOptionsVault
    function setITMOptionPriceRatio(uint256 ratio)
        external
        override
        onlyController
    {
        _itmOptionPriceRatio = ratio;

        emit ITMOptionPriceRatioChanged(ratio);
    }

    /// @inheritdoc ERC4626
    function maxDeposit(address receiver)
        public
        view
        override(ERC4626, IERC4626)
        returns (uint256 maxAssets)
    {
        if (receiver != owner()) return 0;
        if (msg.sender != owner()) return 0;

        return super.maxDeposit(receiver);
    }

    /// @inheritdoc ERC4626
    function maxMint(address receiver)
        public
        view
        override(ERC4626, IERC4626)
        returns (uint256 maxShares)
    {
        if (receiver != owner()) return 0;
        if (msg.sender != owner()) return 0;

        return super.maxMint(receiver);
    }

    /// @inheritdoc ERC4626
    /// @notice Assuming single owner holds all shares
    function maxWithdraw(address receiver)
        public
        view
        override(ERC4626, IERC4626)
        returns (uint256)
    {
        uint256 amount = super.maxWithdraw(receiver);
        uint256 buyOrderAmount = _buyOrder.underlyingAssetAmount;
        if (buyOrderAmount >= amount) return 0;

        return amount - buyOrderAmount;
    }

    /// @inheritdoc ERC4626
    /// @notice Assuming single owner holds all shares
    function maxRedeem(address receiver)
        public
        view
        override(ERC4626, IERC4626)
        returns (uint256)
    {
        uint256 shares = super.maxRedeem(receiver);
        uint256 buyOrderShares = convertToShares(
            _buyOrder.underlyingAssetAmount
        );
        if (buyOrderShares >= shares) return 0;

        return shares - buyOrderShares;
    }

    // @inheritdoc ERC4626
    function totalAssets()
        public
        view
        override(ERC4626, IERC4626)
        returns (uint256)
    {
        uint256 optionsValue = 0;
        address[] memory tokens = _oTokens.values();
        uint256 n = tokens.length;
        for (uint256 i = 0; i < n; i++) {
            optionsValue += _getOptionValue(IOToken(tokens[i]));
        }

        return IERC20(asset()).balanceOf(address(this)) + optionsValue;
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
    function pricer() external view override returns (address) {
        return address(_pricer);
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
        returns (address underlyingOptionsAssetAddress)
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
    function optionPremiumRatio()
        external
        view
        override
        returns (uint256 ratio)
    {
        return _optionPremiumRatio;
    }

    /// @inheritdoc IPutOptionsVault
    function itmOptionPriceRatio() external view returns (uint256 ratio) {
        return _itmOptionPriceRatio;
    }

    /// @inheritdoc IPutOptionsVault
    function maxOrderActive() external view returns (uint256) {
        return _maxOrderActive;
    }

    /// @inheritdoc IPutOptionsVault
    function minChunkValue() external view returns (uint256) {
        return _minChunkValue;
    }

    /// @inheritdoc IPutOptionsVault
    function opynAddressBook() external view returns (address) {
        return _opynAddressBook;
    }

    function _afterDeposit(uint256, uint256) internal override {
        uint256 balance = IERC20(asset()).balanceOf(address(this));

        if (balance < _minChunkValue) return;

        if (_buyOrder.active) {
            _cancelBuyOrder();
        }

        uint256 spotPrice = _pricer.getSpot();

        uint64 minExpiryTimestamp = uint64(block.timestamp + _expiryDelta.min);
        uint64 maxExpiryTimestamp = uint64(block.timestamp + _expiryDelta.max);
        uint128 minStrikePrice = uint128(
            (spotPrice * _strikeMultiplier.min) / _ONE
        );
        uint128 maxStrikePrice = uint128(
            (spotPrice * _strikeMultiplier.max) / _ONE
        );

        _buyOrder = BuyOrder({
            active: true,
            minExpiryTimestamp: minExpiryTimestamp,
            maxExpiryTimestamp: maxExpiryTimestamp,
            minStrikePrice: minStrikePrice,
            maxStrikePrice: maxStrikePrice,
            created: uint64(block.timestamp),
            underlyingAssetAmount: balance
        });

        emit BuyOrderCreated(
            minExpiryTimestamp,
            maxExpiryTimestamp,
            minStrikePrice,
            maxStrikePrice,
            balance
        );
    }

    function _beforeWithdraw(uint256, uint256) internal override {
        _checkExpired();
    }

    function _checkExpired() internal returns (bool optionsMatured) {
        address sellOrderToken = _sellOrder.oToken;
        // Copy the tokens array and iterate over it
        // so not to deal with unexpected reorderings in _oTokens
        // when oToken is removed
        address[] memory tokens = _oTokens.values();
        for (uint256 i = 0; i < tokens.length; i++) {
            address oToken = tokens[i];

            // controller will check for option expiration and finalized
            // oracle price and revert when option is not redeemable
            try
                IOTokenController(IOToken(oToken).controller()).operate(
                    _createRedeemAction(oToken)
                )
            {
                optionsMatured = true;

                _oTokens.remove(oToken);

                if (oToken == sellOrderToken) {
                    _cancelSellOrder();
                }

                emit OptionRedeemed(oToken);
                // solhint-disable-next-line no-empty-blocks
            } catch {}
        }
    }

    /**
     * @dev 3 possible ways
     *      1. oToken is not expired => pricer is used to estimate option price
     *      2. oToken is expired, but oracle price is not finalized => apply _itmOptionPriceRatio to option price
     *      3. oToken is expired and oracle price is finalized => option value is finalized
     */
    function _getOptionValue(IOToken oToken) internal view returns (uint256) {
        // slither-disable-next-line calls-loop
        (
            address collateralAsset,
            address underlyingAsset,
            address strikeAsset,
            uint256 strikePrice,
            uint256 expiryTimestamp,

        ) = oToken.getOtokenDetails();

        if (block.timestamp < expiryTimestamp) {
            return
                _getNonExpiredOptionValue(
                    oToken,
                    strikePrice,
                    expiryTimestamp
                );
        }
        // slither-disable-next-line calls-loop
        IOTokenController oTokenController = IOTokenController(
            oToken.controller()
        );
        if (
            // slither-disable-next-line calls-loop
            !oTokenController.canSettleAssets(
                underlyingAsset,
                strikeAsset,
                collateralAsset,
                expiryTimestamp
            )
        ) {
            return
                _getExpiredNonFinalizedOptionValue(
                    oToken,
                    oTokenController,
                    underlyingAsset,
                    strikePrice,
                    expiryTimestamp
                );
        }

        return _getExpiredOptionPayout(oToken, oTokenController);
    }

    function _getNonExpiredOptionValue(
        IOToken oToken,
        uint256 strikePrice,
        uint256 expiryTimestamp
    ) internal view returns (uint256) {
        // slither-disable-next-line calls-loop
        return
            ((_pricer.getPremium(strikePrice, expiryTimestamp, true) *
                oToken.balanceOf(address(this))) / (10**_pricerDecimals))
                .adjust(_O_TOKEN_DECIMALS, decimals());
    }

    function _getExpiredOptionPayout(
        IOToken oToken,
        IOTokenController oTokenController
    ) internal view returns (uint256) {
        // slither-disable-next-line calls-loop
        return
            oTokenController.getPayout(
                address(oToken),
                oToken.balanceOf(address(this))
            );
    }

    function _getExpiredNonFinalizedOptionValue(
        IOToken oToken,
        IOTokenController oTokenController,
        address underlyingAsset,
        uint256 strikePrice,
        uint256 expiryTimestamp
    ) internal view returns (uint256) {
        // slither-disable-next-line calls-loop
        (uint256 price, ) = oTokenController.oracle().getExpiryPrice(
            underlyingAsset,
            expiryTimestamp
        );

        if (price >= strikePrice) return 0; // OTM

        // slither-disable-next-line calls-loop
        return (((strikePrice - price) *
            _itmOptionPriceRatio *
            oToken.balanceOf(address(this))) / (_ONE * 10**_O_TOKEN_DECIMALS));
    }

    /* solhint-disable max-line-length */
    /**
     * @dev Reference: https://opyn.gitbook.io/opyn/get-started/actions#redeem
     *      Example: https://github.com/opynfinance/GammaProtocol/blob/master/test/integration-tests/nakedPutExpireITM.test.ts#L272
     */
    /* solhint-enable max-line-length */
    function _createRedeemAction(address oToken)
        internal
        view
        returns (Actions.ActionArgs[] memory)
    {
        Actions.ActionArgs[] memory actions = new Actions.ActionArgs[](1);
        actions[0] = Actions.ActionArgs({
            actionType: Actions.ActionType.Redeem,
            owner: address(0),
            secondAddress: address(this),
            asset: oToken,
            vaultId: 0,
            amount: IERC20(oToken).balanceOf(address(this)),
            index: 0,
            data: ""
        });
        return actions;
    }

    function _setStrikeMultiplier(uint256 min, uint256 max) internal {
        if (min > max) revert AeraPOV__StrikeMultiplierRangeNotValid(min, max);
        if (min == 0) {
            revert AeraPOV__StrikeMultiplierMinValueBelowExpected(min, 1);
        }
        if (max >= _ONE) {
            revert AeraPOV__StrikeMultiplierMaxValueExceedsExpected(
                max,
                _ONE - 1
            );
        }

        _strikeMultiplier = Range(min, max);

        emit StrikeMultiplierChanged(min, max);
    }

    function _setExpiryDelta(uint256 min, uint256 max) internal {
        if (min > max) revert AeraPOV__ExpiryDeltaRangeNotValid(min, max);

        _expiryDelta = Range(min, max);

        emit ExpiryDeltaChanged(min, max);
    }

    function _cancelSellOrder() internal {
        emit SellOrderCancelled(_sellOrder.oToken, _sellOrder.amount);

        delete _sellOrder;
    }

    function _cancelBuyOrder() internal {
        emit BuyOrderCancelled(
            _buyOrder.minExpiryTimestamp,
            _buyOrder.maxExpiryTimestamp,
            _buyOrder.minStrikePrice,
            _buyOrder.maxStrikePrice,
            _buyOrder.underlyingAssetAmount
        );

        delete _buyOrder;
    }

    function _verifyWhitelisted(address oToken) internal view {
        address whitelist = AddressBookInterface(_opynAddressBook)
            .getWhitelist();
        if (!WhitelistInterface(whitelist).isWhitelistedOtoken(oToken)) {
            revert AeraPOV__NotWhitelistedOToken(oToken);
        }
    }

    function _verifyParameterMatch(
        BuyOrder memory order,
        address collateralAsset,
        address underlyingAsset,
        address strikeAsset,
        uint256 strikePrice,
        uint256 expiryTimestamp,
        bool isPut
    ) internal view {
        if (!isPut) revert AeraPOV__ExpectedPutOption();
        if (underlyingAsset != address(_underlyingOptionsAsset)) {
            revert AeraPOV__InvalidUnderlyingAsset(
                address(_underlyingOptionsAsset),
                underlyingAsset
            );
        }

        address asset = asset();

        if (collateralAsset != asset) {
            revert AeraPOV__InvalidCollateralAsset(asset, collateralAsset);
        }
        if (strikeAsset != asset) {
            revert AeraPOV__InvalidStrikeAsset(asset, strikeAsset);
        }

        if (
            order.minExpiryTimestamp > expiryTimestamp ||
            order.maxExpiryTimestamp < expiryTimestamp
        ) {
            revert AeraPOV__ExpiryTimestampIsNotInRange(
                order.minExpiryTimestamp,
                order.maxExpiryTimestamp,
                expiryTimestamp
            );
        }
        if (
            order.minStrikePrice > strikePrice ||
            order.maxStrikePrice < strikePrice
        ) {
            revert AeraPOV__StrikePriceIsNotInRange(
                order.minStrikePrice,
                order.maxStrikePrice,
                strikePrice
            );
        }
    }

    /// @dev Estimates how much oTokens we can buy/sell for given amount of underlying tokens (for example: USDC)
    /// @param strikePrice - oToken strike price
    /// @param expiryTimestamp - oToken expiry timestamp
    /// @param underlyingAssetAmount - amount of underlying tokens (for example: USDC)
    /// @param buyingOTokens - specifies whether we're buying or selling oTokens
    function _estimateOTokenAmount(
        uint256 strikePrice,
        uint256 expiryTimestamp,
        uint256 underlyingAssetAmount,
        bool buyingOTokens
    ) internal view returns (uint256) {
        uint256 optionPremium = _getOptionPrice(
            strikePrice,
            expiryTimestamp,
            buyingOTokens
        );

        // In case of USDC (which have 6 decimals) we're upscaling amount
        // to 8 decimals, to increase precision
        uint256 adjustedAmount = underlyingAssetAmount.adjust(
            decimals(),
            _pricerDecimals
        );

        return
            ((adjustedAmount * 10**_O_TOKEN_DECIMALS) / optionPremium).adjust(
                _pricerDecimals,
                _O_TOKEN_DECIMALS
            );
    }

    function _getOptionPrice(
        uint256 strikePrice,
        uint256 expiryTimestamp,
        bool buyingOTokens
    ) internal view returns (uint256) {
        uint256 premium = _pricer.getPremium(
            strikePrice,
            expiryTimestamp,
            true
        );

        if (buyingOTokens) {
            return (premium * _ONE) / _optionPremiumRatio;
        } else {
            return (premium * _optionPremiumRatio) / _ONE;
        }
    }
}
