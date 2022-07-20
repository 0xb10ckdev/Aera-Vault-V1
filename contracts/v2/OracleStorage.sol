// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "./dependencies/chainlink/interfaces/AggregatorV2V3Interface.sol";
import "./interfaces/IOracleStorage.sol";

/// @title Oracle Storage management contract.
/// @notice Manage oracle information.
/// @dev Store oracle information for gas reduction and cleaner code.
contract OracleStorage is IOracleStorage {
    /// STORAGE ///

    /// @dev Oracle addresses.
    AggregatorV2V3Interface internal immutable oracle0;
    AggregatorV2V3Interface internal immutable oracle1;
    AggregatorV2V3Interface internal immutable oracle2;
    AggregatorV2V3Interface internal immutable oracle3;
    AggregatorV2V3Interface internal immutable oracle4;
    AggregatorV2V3Interface internal immutable oracle5;
    AggregatorV2V3Interface internal immutable oracle6;
    AggregatorV2V3Interface internal immutable oracle7;
    AggregatorV2V3Interface internal immutable oracle8;
    AggregatorV2V3Interface internal immutable oracle9;
    AggregatorV2V3Interface internal immutable oracle10;
    AggregatorV2V3Interface internal immutable oracle11;
    AggregatorV2V3Interface internal immutable oracle12;
    AggregatorV2V3Interface internal immutable oracle13;
    AggregatorV2V3Interface internal immutable oracle14;
    AggregatorV2V3Interface internal immutable oracle15;
    AggregatorV2V3Interface internal immutable oracle16;
    AggregatorV2V3Interface internal immutable oracle17;
    AggregatorV2V3Interface internal immutable oracle18;
    AggregatorV2V3Interface internal immutable oracle19;

    /// @dev Units in oracle decimals.
    uint256 internal immutable oracleUnit0;
    uint256 internal immutable oracleUnit1;
    uint256 internal immutable oracleUnit2;
    uint256 internal immutable oracleUnit3;
    uint256 internal immutable oracleUnit4;
    uint256 internal immutable oracleUnit5;
    uint256 internal immutable oracleUnit6;
    uint256 internal immutable oracleUnit7;
    uint256 internal immutable oracleUnit8;
    uint256 internal immutable oracleUnit9;
    uint256 internal immutable oracleUnit10;
    uint256 internal immutable oracleUnit11;
    uint256 internal immutable oracleUnit12;
    uint256 internal immutable oracleUnit13;
    uint256 internal immutable oracleUnit14;
    uint256 internal immutable oracleUnit15;
    uint256 internal immutable oracleUnit16;
    uint256 internal immutable oracleUnit17;
    uint256 internal immutable oracleUnit18;
    uint256 internal immutable oracleUnit19;

    /// @dev Index of asset to be used as base token for oracles.
    uint256 internal immutable numOracles;

    /// @dev Index of asset to be used as base token for oracles.
    uint256 public immutable numeraireAssetIndex;

    /// ERRORS ///

    error Aera__OracleLengthIsNotSame(
        uint256 tokenLength,
        uint256 oracleLength
    );
    error Aera__NumeraireAssetIndexExceedsTokenLength(
        uint256 tokenLength,
        uint256 index
    );
    error Aera__OracleIsZeroAddress(uint256 index);
    error Aera__NumeraireOracleIsNotZeroAddress(uint256 index);
    error Aera__OraclePriceIsInvalid(uint256 index, int256 actual);

    /// FUNCTIONS ///

    /// @notice Initialize the oracle information.
    /// @param oracles Chainlink oracle addresses.
    ///                All oracles should be in reference to the same asset.
    /// @param numeraireAssetIndex_ Index of base token for oracles.
    // prettier-ignore
    constructor(
        AggregatorV2V3Interface[] memory oracles,
        uint256 numeraireAssetIndex_,
        uint256 numTokens
    ) {
        numOracles = oracles.length;

        if (numTokens != numOracles) {
            revert Aera__OracleLengthIsNotSame(numTokens, numOracles);
        }
        if (numeraireAssetIndex_ >= numTokens) {
            revert Aera__NumeraireAssetIndexExceedsTokenLength(
                numTokens,
                numeraireAssetIndex_
            );
        }

        // Check if oracle address is zero address.
        // Oracle for base token could be specified as zero address.
        for (uint256 i = 0; i < numTokens; i++) {
            if (i != numeraireAssetIndex_) {
                if (address(oracles[i]) == address(0)) {
                    revert Aera__OracleIsZeroAddress(i);
                }
            } else if (address(oracles[i]) != address(0)) {
                revert Aera__NumeraireOracleIsNotZeroAddress(i);
            }
        }

        AggregatorV2V3Interface invalidAggregator = AggregatorV2V3Interface(
            address(0)
        );

        oracle0 = oracles[0];
        oracle1 = oracles[1];
        oracle2 = numOracles > 2 ? oracles[2] : invalidAggregator;
        oracle3 = numOracles > 3 ? oracles[3] : invalidAggregator;
        oracle4 = numOracles > 4 ? oracles[4] : invalidAggregator;
        oracle5 = numOracles > 5 ? oracles[5] : invalidAggregator;
        oracle6 = numOracles > 6 ? oracles[6] : invalidAggregator;
        oracle7 = numOracles > 7 ? oracles[7] : invalidAggregator;
        oracle8 = numOracles > 8 ? oracles[8] : invalidAggregator;
        oracle9 = numOracles > 9 ? oracles[9] : invalidAggregator;
        oracle10 = numOracles > 10 ? oracles[10] : invalidAggregator;
        oracle11 = numOracles > 11 ? oracles[11] : invalidAggregator;
        oracle12 = numOracles > 12 ? oracles[12] : invalidAggregator;
        oracle13 = numOracles > 13 ? oracles[13] : invalidAggregator;
        oracle14 = numOracles > 14 ? oracles[14] : invalidAggregator;
        oracle15 = numOracles > 15 ? oracles[15] : invalidAggregator;
        oracle16 = numOracles > 16 ? oracles[16] : invalidAggregator;
        oracle17 = numOracles > 17 ? oracles[17] : invalidAggregator;
        oracle18 = numOracles > 18 ? oracles[18] : invalidAggregator;
        oracle19 = numOracles > 19 ? oracles[19] : invalidAggregator;

        oracleUnit0 = numeraireAssetIndex_ > 0 ? 10**oracles[0].decimals() : 0;
        oracleUnit1 = numeraireAssetIndex_ != 1 ? 10**oracles[1].decimals() : 0;
        oracleUnit2 = numOracles > 2 && numeraireAssetIndex_ != 2 ? 10**oracles[2].decimals() : 0;
        oracleUnit3 = numOracles > 3 && numeraireAssetIndex_ != 3 ? 10**oracles[3].decimals() : 0;
        oracleUnit4 = numOracles > 4 && numeraireAssetIndex_ != 4 ? 10**oracles[4].decimals() : 0;
        oracleUnit5 = numOracles > 5 && numeraireAssetIndex_ != 5 ? 10**oracles[5].decimals() : 0;
        oracleUnit6 = numOracles > 6 && numeraireAssetIndex_ != 6 ? 10**oracles[6].decimals() : 0;
        oracleUnit7 = numOracles > 7 && numeraireAssetIndex_ != 7 ? 10**oracles[7].decimals() : 0;
        oracleUnit8 = numOracles > 8 && numeraireAssetIndex_ != 8 ? 10**oracles[8].decimals() : 0;
        oracleUnit9 = numOracles > 9 && numeraireAssetIndex_ != 9 ? 10**oracles[9].decimals() : 0;
        oracleUnit10 = numOracles > 10 && numeraireAssetIndex_ != 10 ? 10**oracles[10].decimals() : 0;
        oracleUnit11 = numOracles > 11 && numeraireAssetIndex_ != 11 ? 10**oracles[11].decimals() : 0;
        oracleUnit12 = numOracles > 12 && numeraireAssetIndex_ != 12 ? 10**oracles[12].decimals() : 0;
        oracleUnit13 = numOracles > 13 && numeraireAssetIndex_ != 13 ? 10**oracles[13].decimals() : 0;
        oracleUnit14 = numOracles > 14 && numeraireAssetIndex_ != 14 ? 10**oracles[14].decimals() : 0;
        oracleUnit15 = numOracles > 15 && numeraireAssetIndex_ != 15 ? 10**oracles[15].decimals() : 0;
        oracleUnit16 = numOracles > 16 && numeraireAssetIndex_ != 16 ? 10**oracles[16].decimals() : 0;
        oracleUnit17 = numOracles > 17 && numeraireAssetIndex_ != 17 ? 10**oracles[17].decimals() : 0;
        oracleUnit18 = numOracles > 18 && numeraireAssetIndex_ != 18 ? 10**oracles[18].decimals() : 0;
        oracleUnit19 = numOracles > 19 && numeraireAssetIndex_ != 19 ? 10**oracles[19].decimals() : 0;

        numeraireAssetIndex = numeraireAssetIndex_;
    }

    /// @inheritdoc IOracleStorage
    // prettier-ignore
    // solhint-disable-next-line code-complexity
    function getOracles()
        public
        view
        returns (AggregatorV2V3Interface[] memory)
    {
        AggregatorV2V3Interface[]
            memory oracles = new AggregatorV2V3Interface[](numOracles);

        oracles[0] = oracle0;
        oracles[1] = oracle1;
        if (numOracles > 2) { oracles[2] = oracle2; } else { return oracles; }
        if (numOracles > 3) { oracles[3] = oracle3; } else { return oracles; }
        if (numOracles > 4) { oracles[4] = oracle4; } else { return oracles; }
        if (numOracles > 5) { oracles[5] = oracle5; } else { return oracles; }
        if (numOracles > 6) { oracles[6] = oracle6; } else { return oracles; }
        if (numOracles > 7) { oracles[7] = oracle7; } else { return oracles; }
        if (numOracles > 8) { oracles[8] = oracle8; } else { return oracles; }
        if (numOracles > 9) { oracles[9] = oracle9; } else { return oracles; }
        if (numOracles > 10) { oracles[10] = oracle10; } else { return oracles; }
        if (numOracles > 11) { oracles[11] = oracle11; } else { return oracles; }
        if (numOracles > 12) { oracles[12] = oracle12; } else { return oracles; }
        if (numOracles > 13) { oracles[13] = oracle13; } else { return oracles; }
        if (numOracles > 14) { oracles[14] = oracle14; } else { return oracles; }
        if (numOracles > 15) { oracles[15] = oracle15; } else { return oracles; }
        if (numOracles > 16) { oracles[16] = oracle16; } else { return oracles; }
        if (numOracles > 17) { oracles[17] = oracle17; } else { return oracles; }
        if (numOracles > 18) { oracles[18] = oracle18; } else { return oracles; }
        if (numOracles > 19) { oracles[19] = oracle19; } else { return oracles; }

        return oracles;
    }

    /// @inheritdoc IOracleStorage
    // prettier-ignore
    // solhint-disable-next-line code-complexity
    function getOracleUnits() public view returns (uint256[] memory) {
        uint256[] memory oracleUnits = new uint256[](numOracles);

        oracleUnits[0] = oracleUnit0;
        oracleUnits[1] = oracleUnit1;
        if (numOracles > 2) { oracleUnits[2] = oracleUnit2; } else { return oracleUnits; }
        if (numOracles > 3) { oracleUnits[3] = oracleUnit3; } else { return oracleUnits; }
        if (numOracles > 4) { oracleUnits[4] = oracleUnit4; } else { return oracleUnits; }
        if (numOracles > 5) { oracleUnits[5] = oracleUnit5; } else { return oracleUnits; }
        if (numOracles > 6) { oracleUnits[6] = oracleUnit6; } else { return oracleUnits; }
        if (numOracles > 7) { oracleUnits[7] = oracleUnit7; } else { return oracleUnits; }
        if (numOracles > 8) { oracleUnits[8] = oracleUnit8; } else { return oracleUnits; }
        if (numOracles > 9) { oracleUnits[9] = oracleUnit9; } else { return oracleUnits; }
        if (numOracles > 10) { oracleUnits[10] = oracleUnit10; } else { return oracleUnits; }
        if (numOracles > 11) { oracleUnits[11] = oracleUnit11; } else { return oracleUnits; }
        if (numOracles > 12) { oracleUnits[12] = oracleUnit12; } else { return oracleUnits; }
        if (numOracles > 13) { oracleUnits[13] = oracleUnit13; } else { return oracleUnits; }
        if (numOracles > 14) { oracleUnits[14] = oracleUnit14; } else { return oracleUnits; }
        if (numOracles > 15) { oracleUnits[15] = oracleUnit15; } else { return oracleUnits; }
        if (numOracles > 16) { oracleUnits[16] = oracleUnit16; } else { return oracleUnits; }
        if (numOracles > 17) { oracleUnits[17] = oracleUnit17; } else { return oracleUnits; }
        if (numOracles > 18) { oracleUnits[18] = oracleUnit18; } else { return oracleUnits; }
        if (numOracles > 19) { oracleUnits[19] = oracleUnit19; } else { return oracleUnits; }

        return oracleUnits;
    }
}
