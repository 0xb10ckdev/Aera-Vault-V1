// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "./Actions.sol";
import "./OracleInterface.sol";

interface IOTokenController {
    /**
     * @notice get an oToken's payout/cash value after expiry, in the collateral asset
     * @param _otoken oToken address
     * @param _amount amount of the oToken to calculate the payout for, always represented in 1e8
     * @return amount of collateral to pay out
     */
    function getPayout(address _otoken, uint256 _amount) external view returns (uint256);

    /**
     * @dev return if an expired oToken is ready to be settled, only true when price for underlying,
     * strike and collateral assets at this specific expiry is available in our Oracle module
     * @param _otoken oToken
     */
    function isSettlementAllowed(address _otoken) external view returns (bool);

    /**
     * @dev return if underlying, strike, collateral are all allowed to be settled
     * @param _underlying oToken underlying asset
     * @param _strike oToken strike asset
     * @param _collateral oToken collateral asset
     * @param _expiry otoken expiry timestamp
     * @return True if the oToken has expired AND all oracle prices at the expiry timestamp have been finalized, False if not
     */
    function canSettleAssets(
        address _underlying,
        address _strike,
        address _collateral,
        uint256 _expiry
    ) external view returns (bool);

    /**
     * @notice check if an oToken has expired
     * @param _otoken oToken address
     * @return True if the otoken has expired, False if not
     */
    function hasExpired(address _otoken) external view returns (bool);

    /**
     * @notice execute a number of actions on specific vaults
     * @dev can only be called when the system is not fully paused
     * @param _actions array of actions arguments
     */
    function operate(Actions.ActionArgs[] memory _actions) external;

    /**
     * @notice oracle which is used for option pricing
     */
    function oracle() external view returns (OracleInterface);
}
