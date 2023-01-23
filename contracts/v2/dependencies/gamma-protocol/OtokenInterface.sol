// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

// This is a copy from https://github.com/opynfinance/GammaProtocol/blob/master/contracts/interfaces/OtokenInterface.sol

interface OtokenInterface {
    // Added by Aera Team
    function controller() external view returns (address);

    function addressBook() external view returns (address);

    function underlyingAsset() external view returns (address);

    function strikeAsset() external view returns (address);

    function collateralAsset() external view returns (address);

    function strikePrice() external view returns (uint256);

    function expiryTimestamp() external view returns (uint256);

    function isPut() external view returns (bool);

    function init(
        address _addressBook,
        address _underlyingAsset,
        address _strikeAsset,
        address _collateralAsset,
        uint256 _strikePrice,
        uint256 _expiry,
        bool _isPut
    ) external;

    function getOtokenDetails()
        external
        view
        returns (
            address collateralAsset,
            address underlyingAsset,
            address strikeAsset,
            uint256 strikePrice,
            uint256 expiryTimestamp,
            bool isPut
        );

    function mintOtoken(address account, uint256 amount) external;

    function burnOtoken(address account, uint256 amount) external;
}
