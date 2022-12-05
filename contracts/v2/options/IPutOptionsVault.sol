// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../dependencies/openzeppelin/IERC4626.sol";

interface IPutOptionsVault is IERC4626 {
    struct BuyOrder {
        bool active; // false if no buy order active
        uint256 minExpiryTimestamp; // min value of expiry
        uint256 maxExpiryTimestamp; // max value of expiry
        uint256 minStrikePrice; // min value of strike price with 8 decimals
        uint256 maxStrikePrice; // max value of strike price with 8 decimals
        uint256 amount;
    }

    struct SellOrder {
        uint256 amount;
        address oToken; // address of the specific oToken for sale
        bool active; // false if no sell order active
    }

    /**
     * @dev Get address of Aera vault.
     */
    function owner() external view returns (address);

    /**
     * @dev Get address of broker (settles options orders).
     */
    function broker() external view returns (address);

    /**
     * @dev Get address of controller (sets ranges for strikes and expiries).
     */
    function controller() external view returns (address);

    /**
     * @dev Get address of the liquidator (initiates sell auctions).
     */
    function liquidator() external view returns (address);

    /**
     * @dev Check maturity for all options positions and clean up positions that are past maturity.
     * @return true if a position was cleaned up (independent of whether it matured in-the-money or not).
     */
    function checkMaturity() external returns (bool);

    /**
     * @dev Initiate a sell order for a given options position.
     */
    function sell(uint256 positionId, uint256 amount) external;

    /**
     * @dev Set minimum expiry time
     */
    function setMinExpiryDelta(uint256 minExpiryDelta) external;

    /**
     * @dev Set maximum expiry time
     */
    function setMaxExpiryDelta(uint256 maxExpiryDelta) external;

    /**
     * @dev Ratio representing minimum strike price as a function of spot price. For example 40% would
     *      signify that the strike price should be set to spot price x 0.4. Specified using 18 decimals.
     *      MUST be >0 and <1
     */
    function setMinStrikeMultiplier(uint256 minStrikeMultiplier) external;

    /**
     * @dev Ratio representing maximum strike price as a function of spot price.
     *      Set similarly to setMinStrikeMultiplier. MUST be >0 and <1
     */
    function setMaxStrikeMultiplier(uint256 maxStrikeMultiplier) external;

    /**
     * @dev See all currently held options
     */
    function positions()
        external
        view
        returns (IERC20[] memory oTokenAddresses);

    /**
     * @dev Reveal the underlying options asset. Please note, this should not be confused with the underlying asset of the ERC4626 vault itself.
     */
    function underlyingOptionsAsset()
        external
        view
        returns (IERC20 underlyingOptionsAssetAddress);

    /**
     * @dev Reveal current buy order if it exists
     */
    function buyOrder() external view returns (BuyOrder memory buyOrder);

    /**
     * @dev Reveal current sell order if it exists
     */
    function sellOrder() external view returns (SellOrder memory sellOrder);

    /**
     * @dev Allows broker to fill current buy order. Note that order will be filled as long as
     *      expiry and strike price of the oToken is within the range specified by buy order.
     */
    function fillBuyOrder(
        address oToken,
        uint256 amount
    ) external returns (bool filled);

    /**
     * @dev Allows broker to fill current sell order
     */
    function fillSellOrder(uint256 amount) external returns (bool filled);

    /**
     * @dev Removes the current buy order
     */
    function cancelBuyOrder() external;

    /**
     * @dev Removes the current sell order
     */
    function cancelSellOrder() external;
}
