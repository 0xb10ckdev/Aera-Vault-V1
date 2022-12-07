// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../../dependencies/openzeppelin/IERC4626.sol";
import "./IOToken.sol";

interface IPutOptionsVault is IERC4626 {
    /// EVENTS ///

    /// @notice Raised when expiry delta is changed
    event ExpiryDeltaChanged(uint256 min, uint256 max);

    /// @notice Raised when strike multiplier is changed
    event StrikeMultiplierChanged(uint256 min, uint256 max);

    /// @notice Raised when buy order is created
    event BuyOrderCreated(
        uint256 minExpiryTimestamp,
        uint256 maxExpiryTimestamp,
        uint256 minStrikePrice,
        uint256 maxStrikePrice,
        uint256 amount
    );

    /// @notice Raised when buy order is filled
    event BuyOrderFilled(address indexed oToken, uint256 amount);

    /// @notice Raised when buy order has been cancelled
    event BuyOrderCancelled(
        uint64 minExpiryTimestamp,
        uint64 maxExpiryTimestamp,
        uint128 minStrikePrice,
        uint128 maxStrikePrice,
        uint256 amount
    );

    /// @notice Raised when sell order is created
    event SellOrderCreated(address indexed oToken, uint256 amount);

    /// @notice Raised when sell order is filled
    event SellOrderFilled(address indexed oToken, uint256 amount);

    /// @notice Raised when sell order has been cancelled
    event SellOrderCancelled(address indexed oToken, uint256 amount);

    /// ERRORS ///

    error Aera__PricerAddressIsZero();
    error Aera__OwnerAddressIsZero();
    error Aera__ControllerAddressIsZero();
    error Aera__LiquidatorAddressIsZero();
    error Aera__BrokerAddressIsZero();
    error Aera__UnderlyingOptionsAssetAddressIsZero();
    error Aera__PutOptionsPricerIsNotValid(address pricer);
    error Aera__PutOptionsBrokerIsNotValid(address broker);
    error Aera__CallerIsNotBroker();
    error Aera__CallerIsNotLiquidator();
    error Aera__CallerIsNotController();
    error Aera__ExpiryDeltaRangeNotValid(uint256 min, uint256 max);
    error Aera__StrikeMultiplierRangeNotValid(uint256 min, uint256 max);
    error Aera__StrikeMultiplierMinValueBelowExpected(
        uint256 actual,
        uint256 expected
    );
    error Aera__StrikeMultiplierMaxValueExceedsExpected(
        uint256 actual,
        uint256 expected
    );
    error Aera__BuyOrderIsNotActive();
    error Aera__SellOrderIsNotActive();

    /// STRUCTS ///

    /// @notice Container for range information
    struct Range {
        uint256 min;
        uint256 max;
    }

    /// @notice Container for buy order information
    struct BuyOrder {
        uint256 amount;
        uint128 minStrikePrice; // min value of strike price with 8 decimals
        uint128 maxStrikePrice; // max value of strike price with 8 decimals
        uint64 minExpiryTimestamp; // min value of expiry
        uint64 maxExpiryTimestamp; // max value of expiry
        bool active; // false if no buy order active
    }

    /// @notice Container for sell order information
    struct SellOrder {
        uint256 amount;
        address oToken; // address of the specific oToken for sale
        bool active; // false if no sell order active
    }

    /// @notice Get address of broker (settles options orders).
    function broker() external view returns (address);

    /// @notice Get address of controller (sets ranges for strikes and expiries).
    function controller() external view returns (address);

    /// @notice Get address of the liquidator (initiates sell auctions).
    function liquidator() external view returns (address);

    /// @notice Check maturity for all options positions and clean up positions that are past maturity.
    /// @return true if a position was cleaned up (independent of whether it matured in-the-money or not).
    function checkMaturity() external returns (bool);

    /// @notice Initiate a sell order for a given options position.
    /// @param positionId option position identifier
    /// @param amount option amount
    function sell(uint256 positionId, uint256 amount) external;

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

    /// @notice See all currently held options
    /// @return oTokenAddresses List of oTokens
    function positions()
        external
        view
        returns (IOToken[] memory oTokenAddresses);

    /// @notice Reveal the underlying options asset. Please note, this should not be confused
    ///         with the underlying asset of the ERC4626 vault itself.
    /// @return underlyingOptionsAssetAddress - underlying options asset address
    function underlyingOptionsAsset()
        external
        view
        returns (IERC20 underlyingOptionsAssetAddress);

    /// @notice Reveal current buy order if it exists
    function buyOrder() external view returns (BuyOrder memory);

    /// @notice Reveal current sell order if it exists
    function sellOrder() external view returns (SellOrder memory);

    /// @notice Allows broker to fill current buy order. Note that order will be filled as long as
    ///         expiry and strike price of the oToken is within the range specified by buy order.
    function fillBuyOrder(
        IOToken oToken,
        uint256 amount
    ) external returns (bool filled);

    /// @notice Allows broker to fill current sell order
    function fillSellOrder(uint256 amount) external returns (bool filled);

    /// @notice Removes the current buy order
    function cancelBuyOrder() external;

    /// @notice Removes the current sell order
    function cancelSellOrder() external;
}
