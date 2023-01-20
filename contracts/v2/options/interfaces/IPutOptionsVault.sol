// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../../dependencies/openzeppelin/IERC4626.sol";

interface IPutOptionsVault is IERC4626 {
    /// EVENTS ///

    /// @notice Raised when expiry delta is changed
    event ExpiryDeltaChanged(uint256 min, uint256 max);

    /// @notice Raised when strike multiplier is changed
    event StrikeMultiplierChanged(uint256 min, uint256 max);

    /// @notice Raised when option premium ratio is changed
    event OptionPremiumRatioChanged(uint256 ratio);

    /// @notice Raise when ITM option price ratio is changed
    event ITMOptionPriceRatioChanged(uint256 ratio);

    /// @notice Raised when buy order is created
    event BuyOrderCreated(
        uint256 minExpiryTimestamp,
        uint256 maxExpiryTimestamp,
        uint256 minStrikePrice,
        uint256 maxStrikePrice,
        uint256 underlyingAssetAmount
    );

    /// @notice Raised when buy order is filled
    event BuyOrderFilled(address indexed oToken, uint256 amount);

    /// @notice Raised when buy order has been cancelled
    event BuyOrderCancelled(
        uint64 minExpiryTimestamp,
        uint64 maxExpiryTimestamp,
        uint128 minStrikePrice,
        uint128 maxStrikePrice,
        uint256 underlyingAssetAmount
    );

    /// @notice Raised when sell order is created
    event SellOrderCreated(address indexed oToken, uint256 amount);

    /// @notice Raised when sell order is filled
    event SellOrderFilled(address indexed oToken, uint256 amount);

    /// @notice Raised when sell order has been cancelled
    event SellOrderCancelled(address indexed oToken, uint256 amount);

    /// @notice Raised when option has been redeemed
    event OptionRedeemed(address indexed oToken);

    /// ERRORS ///

    error AeraPOV__PricerIsZeroAddress();
    error AeraPOV__OwnerIsZeroAddress();
    error AeraPOV__ControllerIsZeroAddress();
    error AeraPOV__LiquidatorIsZeroAddress();
    error AeraPOV__OpynAddressBookIsZeroAddress();
    error AeraPOV__BrokerIsZeroAddress();
    error AeraPOV__UnderlyingAssetIsZeroAddress();
    error AeraPOV__UnderlyingOptionsAssetIsZeroAddress();
    error AeraPOV__PutOptionsPricerIsNotValid(address pricer);
    error AeraPOV__CallerIsNotBroker();
    error AeraPOV__CallerIsNotLiquidator();
    error AeraPOV__CallerIsNotController();
    error AeraPOV__ExpiryDeltaRangeNotValid(uint256 min, uint256 max);
    error AeraPOV__StrikeMultiplierRangeNotValid(uint256 min, uint256 max);
    error AeraPOV__StrikeMultiplierMinValueBelowExpected(
        uint256 actual,
        uint256 expected
    );
    error AeraPOV__StrikeMultiplierMaxValueExceedsExpected(
        uint256 actual,
        uint256 expected
    );
    error AeraPOV__BuyOrderIsNotActive();
    error AeraPOV__SellOrderIsNotActive();
    error AeraPOV__InsufficientBalanceToSell(
        uint256 requested,
        uint256 balance
    );
    error AeraPOV__NotEnoughOTokens(uint256 expected, uint256 actual);
    error AeraPOV__NotEnoughAssets(uint256 actual);
    error AeraPOV__UnknownOToken(address oToken);
    error AeraPOV__OptionPremiumRatioIsZero();
    error AeraPOV__ExpectedPutOption();
    error AeraPOV__InvalidUnderlyingAsset(address expected, address actual);
    error AeraPOV__InvalidCollateralAsset(address expected, address actual);
    error AeraPOV__InvalidStrikeAsset(address expected, address actual);
    error AeraPOV__ExpiryTimestampIsNotInRange(
        uint256 min,
        uint256 max,
        uint256 actual
    );
    error AeraPOV__StrikePriceIsNotInRange(
        uint256 min,
        uint256 max,
        uint256 actual
    );
    error AeraPOV__NotWhitelistedOToken(address oToken);

    /// STRUCTS ///

    /// @notice Container for vault creation
    struct ConstructorArgs {
        address controller;
        address liquidator;
        address broker;
        address pricer;
        address underlyingAsset;
        address underlyingOptionsAsset;
        Range expiryDelta;
        Range strikeMultiplier;
        uint256 minChunkValue;
        uint256 maxOrderActive;
        string name;
        string symbol;
        address opynAddressBook;
    }

    /// @notice Container for range information
    struct Range {
        uint256 min;
        uint256 max;
    }

    /// @notice Container for buy order information
    struct BuyOrder {
        uint256 underlyingAssetAmount;
        uint128 minStrikePrice; // min value of strike price with 8 decimals
        uint128 maxStrikePrice; // max value of strike price with 8 decimals
        uint64 minExpiryTimestamp; // min value of expiry
        uint64 maxExpiryTimestamp; // max value of expiry
        uint64 created; // when order has been created
        bool active; // false if no buy order active
    }

    /// @notice Container for sell order information
    struct SellOrder {
        uint256 amount;
        address oToken; // address of the specific oToken for sale
        uint64 created; // when order has been created
        bool active; // false if no sell order active
    }

    /// @notice Get address of broker (settles options orders).
    function broker() external view returns (address);

    /// @notice Get address of controller (sets ranges for strikes and expiries).
    function controller() external view returns (address);

    /// @notice Get address of the liquidator (initiates sell auctions).
    function liquidator() external view returns (address);

    /// @notice Get pricer address
    function pricer() external view returns (address);

    /// @notice Check maturity for all options positions and clean up positions that are past maturity.
    /// @return true if a position was cleaned up (independent of whether it matured in-the-money or not).
    function checkExpired() external returns (bool);

    /// @notice Initiate a sell order for a given options position.
    /// @param oToken oToken address
    /// @param amount oTokens amount to sell
    function sell(address oToken, uint256 amount) external;

    /// @notice Set expiry time range
    /// @param min minumum expiry time (in seconds)
    /// @param max maximum expiry time (in seconds)
    function setExpiryDelta(uint256 min, uint256 max) external;

    /// @notice Ratio representing minimum strike price as a function of spot price. For example 40% would
    ///         signify that the strike price should be set to spot price x 0.4. Specified using 18 decimals.
    ///         MUST be >0 and <1
    /// @param min minimum strike price
    /// @param max maximum strike price
    function setStrikeMultiplier(uint256 min, uint256 max) external;

    /// @notice Ratio representing discount over the option premium which
    ///         the vault is agreed to tolerate over ideal premium returned by the pricer
    function setOptionPremiumRatio(uint256 ratio) external;

    /// @notice Ratio representing ITM option price change when option is expired,
    ///         but the oracle price is not finalized yet.
    function setITMOptionPriceRatio(uint256 ratio) external;

    /// @notice See all currently held options
    /// @return oTokenAddresses List of oTokens
    function positions()
        external
        view
        returns (address[] memory oTokenAddresses);

    /// @notice Reveal the underlying options asset. Please note, this should not be confused
    ///         with the underlying asset of the ERC4626 vault itself.
    /// @return underlyingOptionsAssetAddress - underlying options asset address
    function underlyingOptionsAsset()
        external
        view
        returns (address underlyingOptionsAssetAddress);

    /// @notice Reveal current buy order if it exists
    function buyOrder() external view returns (BuyOrder memory);

    /// @notice Reveal current sell order if it exists
    function sellOrder() external view returns (SellOrder memory);

    /// @notice Allows broker to fill current buy order. Note that order will be filled as long as
    ///         expiry and strike price of the oToken is within the range specified by buy order.
    /// @param oToken oToken to be offered
    /// @param amount Amount of oTokens broker is offering to vault
    function fillBuyOrder(address oToken, uint256 amount) external;

    /// @notice Allows broker to fill current sell order
    /// @param amount Amount of USDC broker is offering to vault
    function fillSellOrder(uint256 amount) external;

    /// @notice Removes the current buy order
    function cancelBuyOrder() external;

    /// @notice Removes the current sell order
    function cancelSellOrder() external;

    /// @notice Returns expiry delta range
    function expiryDelta() external view returns (uint256 min, uint256 max);

    /// @notice Returns strike multiplier range
    function strikeMultiplier()
        external
        view
        returns (uint256 min, uint256 max);

    /// @notice Returns options premium discount
    function optionPremiumRatio() external view returns (uint256 ratio);

    /// @notice Returns ITM option price ratio
    function itmOptionPriceRatio() external view returns (uint256 ratio);

    /// @notice Period of time for a broker to fill buy/sell order.
    ///         After that period order can be cancelled by anyone.
    function maxOrderActive() external view returns (uint256);

    /// @notice Minimum total value in vault underlying asset terms (e.g., USDC) that can be used to purchase options
    function minChunkValue() external view returns (uint256);

    /// @notice Opyn V2 Address Book contract address
    function opynAddressBook() external view returns (address);
}
