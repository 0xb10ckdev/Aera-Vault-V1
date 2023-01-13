// solhint-disable no-empty-blocks
// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../../dependencies/abdk/ABDKMath64x64.sol";
import "../../dependencies/openzeppelin/IERC20Metadata.sol";
import "../../dependencies/openzeppelin/ERC165.sol";
import "../../dependencies/openzeppelin/Address.sol";
import "../../dependencies/premia/oracle/IVolatilitySurfaceOracle.sol";
import "../../dependencies/chainlink/interfaces/AggregatorV2V3Interface.sol";
import "./IPutOptionsPricer.sol";
import "../Decimals.sol";

contract PremiaOptionsPricer is ERC165, IPutOptionsPricer {
    using Address for address;
    using Decimals for uint256;

    error Aera__VolatilitySurfaceOracleIsNotContract();
    error Aera__ChainlinkOracleIsNotContract();
    error Aera__BaseTokenIsNotContract();
    error Aera__UnderlyingTokenIsNotContract();
    error Aera__UnexpectedBaseToken();
    error Aera__UnexpectedUnderlyingToken();

    uint8 private constant _DECIMALS = 8;
    bytes32 private constant _USDC_HASH = keccak256(abi.encodePacked("USDC"));
    bytes32 private constant _WETH_HASH = keccak256(abi.encodePacked("WETH"));

    IVolatilitySurfaceOracle private immutable _premiaOracle;
    AggregatorV2V3Interface private immutable _chainlinkOracle;
    uint8 private immutable _chainlinkDecimals;
    address private immutable _baseToken;
    address private immutable _underlyingToken;

    constructor(
        address volatilitySurfaceOracle,
        address chainlinkOracle,
        address baseToken,
        address underlyingToken
    ) {
        if (!volatilitySurfaceOracle.isContract()) {
            revert Aera__VolatilitySurfaceOracleIsNotContract();
        }
        if (!chainlinkOracle.isContract()) {
            revert Aera__ChainlinkOracleIsNotContract();
        }
        if (!baseToken.isContract()) revert Aera__BaseTokenIsNotContract();
        if (!underlyingToken.isContract()) {
            revert Aera__UnderlyingTokenIsNotContract();
        }

        _verifyTokens(baseToken, underlyingToken);

        _premiaOracle = IVolatilitySurfaceOracle(volatilitySurfaceOracle);
        _baseToken = baseToken;
        _underlyingToken = underlyingToken;
        _chainlinkOracle = AggregatorV2V3Interface(chainlinkOracle);
        _chainlinkDecimals = _chainlinkOracle.decimals();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC165, IERC165)
        returns (bool)
    {
        return
            type(IPutOptionsPricer).interfaceId == interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /// @inheritdoc IPutOptionsPricer
    function getPremium(
        uint256 strikePrice,
        uint256 expiryTimestamp,
        bool isPut
    ) external view override returns (uint256 premium) {
        int128 denominator = int128(int256(10**_DECIMALS));

        int128 spot64x64 = ABDKMath64x64.fromUInt(_getSpot()) / denominator;
        int128 strike64x64 = ABDKMath64x64.fromUInt(strikePrice) / denominator;
        int128 timeToMaturity64x64 = _premiaOracle.getTimeToMaturity64x64(
            uint64(expiryTimestamp)
        );

        int128 premium64x64 = _premiaOracle.getBlackScholesPrice64x64(
            _baseToken,
            _underlyingToken,
            spot64x64,
            strike64x64,
            timeToMaturity64x64,
            !isPut
        );

        return ABDKMath64x64.toUInt(premium64x64 * denominator);
    }

    /// @inheritdoc IPutOptionsPricer
    function getSpot() external view override returns (uint256 spotPrice) {
        return _getSpot();
    }

    /// @inheritdoc IPutOptionsPricer
    function decimals() external pure override returns (uint8) {
        return _DECIMALS;
    }

    function _getSpot() internal view returns (uint256 spotPrice) {
        return
            uint256(_chainlinkOracle.latestAnswer()).adjust(
                _chainlinkDecimals,
                _DECIMALS
            );
    }

    function _verifyTokens(address base, address underlying) internal view {
        if (
            keccak256(abi.encodePacked(IERC20Metadata(base).symbol())) !=
            _USDC_HASH
        ) {
            revert Aera__UnexpectedBaseToken();
        }
        if (
            keccak256(abi.encodePacked(IERC20Metadata(underlying).symbol())) !=
            _WETH_HASH
        ) {
            revert Aera__UnexpectedUnderlyingToken();
        }
    }
}
