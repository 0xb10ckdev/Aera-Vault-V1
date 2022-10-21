// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "./interfaces/IAeraVaultV2.sol";
import "./interfaces/IYieldTokenStorage.sol";

/// @title Yield Token Storage management contract.
/// @notice Manage yield token information.
/// @dev Store yield token information for gas reduction and cleaner code.
contract YieldTokenStorage is IYieldTokenStorage {
    /// STORAGE ///

    /// @dev Yield token addresses.
    IERC4626 internal immutable yieldToken0;
    IERC4626 internal immutable yieldToken1;
    IERC4626 internal immutable yieldToken2;
    IERC4626 internal immutable yieldToken3;
    IERC4626 internal immutable yieldToken4;
    IERC4626 internal immutable yieldToken5;
    IERC4626 internal immutable yieldToken6;
    IERC4626 internal immutable yieldToken7;
    IERC4626 internal immutable yieldToken8;
    IERC4626 internal immutable yieldToken9;
    IERC4626 internal immutable yieldToken10;
    IERC4626 internal immutable yieldToken11;
    IERC4626 internal immutable yieldToken12;
    IERC4626 internal immutable yieldToken13;
    IERC4626 internal immutable yieldToken14;
    IERC4626 internal immutable yieldToken15;
    IERC4626 internal immutable yieldToken16;
    IERC4626 internal immutable yieldToken17;
    IERC4626 internal immutable yieldToken18;
    IERC4626 internal immutable yieldToken19;

    /// @dev Index of underlying assets.
    uint256 internal immutable underlyingIndex0;
    uint256 internal immutable underlyingIndex1;
    uint256 internal immutable underlyingIndex2;
    uint256 internal immutable underlyingIndex3;
    uint256 internal immutable underlyingIndex4;
    uint256 internal immutable underlyingIndex5;
    uint256 internal immutable underlyingIndex6;
    uint256 internal immutable underlyingIndex7;
    uint256 internal immutable underlyingIndex8;
    uint256 internal immutable underlyingIndex9;
    uint256 internal immutable underlyingIndex10;
    uint256 internal immutable underlyingIndex11;
    uint256 internal immutable underlyingIndex12;
    uint256 internal immutable underlyingIndex13;
    uint256 internal immutable underlyingIndex14;
    uint256 internal immutable underlyingIndex15;
    uint256 internal immutable underlyingIndex16;
    uint256 internal immutable underlyingIndex17;
    uint256 internal immutable underlyingIndex18;
    uint256 internal immutable underlyingIndex19;

    /// @dev Number of yield tokens.
    uint256 internal immutable numYieldTokens;

    /// FUNCTIONS ///

    /// @notice Initialize the yieldToken information.
    /// @param yieldTokens Yield token addresses.
    // prettier-ignore
    constructor(
        IAeraVaultV2.YieldToken[] memory yieldTokens
    ) {
        numYieldTokens = yieldTokens.length;

        IERC4626 invalidToken = IERC4626(
            address(0)
        );

        yieldToken0 = numYieldTokens > 0 ? yieldTokens[0].token : invalidToken;
        yieldToken1 = numYieldTokens > 1 ? yieldTokens[1].token : invalidToken;
        yieldToken2 = numYieldTokens > 2 ? yieldTokens[2].token : invalidToken;
        yieldToken3 = numYieldTokens > 3 ? yieldTokens[3].token : invalidToken;
        yieldToken4 = numYieldTokens > 4 ? yieldTokens[4].token : invalidToken;
        yieldToken5 = numYieldTokens > 5 ? yieldTokens[5].token : invalidToken;
        yieldToken6 = numYieldTokens > 6 ? yieldTokens[6].token : invalidToken;
        yieldToken7 = numYieldTokens > 7 ? yieldTokens[7].token : invalidToken;
        yieldToken8 = numYieldTokens > 8 ? yieldTokens[8].token : invalidToken;
        yieldToken9 = numYieldTokens > 9 ? yieldTokens[9].token : invalidToken;
        yieldToken10 = numYieldTokens > 10 ? yieldTokens[10].token : invalidToken;
        yieldToken11 = numYieldTokens > 11 ? yieldTokens[11].token : invalidToken;
        yieldToken12 = numYieldTokens > 12 ? yieldTokens[12].token : invalidToken;
        yieldToken13 = numYieldTokens > 13 ? yieldTokens[13].token : invalidToken;
        yieldToken14 = numYieldTokens > 14 ? yieldTokens[14].token : invalidToken;
        yieldToken15 = numYieldTokens > 15 ? yieldTokens[15].token : invalidToken;
        yieldToken16 = numYieldTokens > 16 ? yieldTokens[16].token : invalidToken;
        yieldToken17 = numYieldTokens > 17 ? yieldTokens[17].token : invalidToken;
        yieldToken18 = numYieldTokens > 18 ? yieldTokens[18].token : invalidToken;
        yieldToken19 = numYieldTokens > 19 ? yieldTokens[19].token : invalidToken;

        underlyingIndex0 = numYieldTokens > 0 ? yieldTokens[0].underlyingIndex : 0;
        underlyingIndex1 = numYieldTokens > 1 ? yieldTokens[1].underlyingIndex : 0;
        underlyingIndex2 = numYieldTokens > 2 ? yieldTokens[2].underlyingIndex : 0;
        underlyingIndex3 = numYieldTokens > 3 ? yieldTokens[3].underlyingIndex : 0;
        underlyingIndex4 = numYieldTokens > 4 ? yieldTokens[4].underlyingIndex : 0;
        underlyingIndex5 = numYieldTokens > 5 ? yieldTokens[5].underlyingIndex : 0;
        underlyingIndex6 = numYieldTokens > 6 ? yieldTokens[6].underlyingIndex : 0;
        underlyingIndex7 = numYieldTokens > 7 ? yieldTokens[7].underlyingIndex : 0;
        underlyingIndex8 = numYieldTokens > 8 ? yieldTokens[8].underlyingIndex : 0;
        underlyingIndex9 = numYieldTokens > 9 ? yieldTokens[9].underlyingIndex : 0;
        underlyingIndex10 = numYieldTokens > 10 ? yieldTokens[10].underlyingIndex : 0;
        underlyingIndex11 = numYieldTokens > 11 ? yieldTokens[11].underlyingIndex : 0;
        underlyingIndex12 = numYieldTokens > 12 ? yieldTokens[12].underlyingIndex : 0;
        underlyingIndex13 = numYieldTokens > 13 ? yieldTokens[13].underlyingIndex : 0;
        underlyingIndex14 = numYieldTokens > 14 ? yieldTokens[14].underlyingIndex : 0;
        underlyingIndex15 = numYieldTokens > 15 ? yieldTokens[15].underlyingIndex : 0;
        underlyingIndex16 = numYieldTokens > 16 ? yieldTokens[16].underlyingIndex : 0;
        underlyingIndex17 = numYieldTokens > 17 ? yieldTokens[17].underlyingIndex : 0;
        underlyingIndex18 = numYieldTokens > 18 ? yieldTokens[18].underlyingIndex : 0;
        underlyingIndex19 = numYieldTokens > 19 ? yieldTokens[19].underlyingIndex : 0;
    }

    /// @inheritdoc IYieldTokenStorage
    // prettier-ignore
    // solhint-disable-next-line code-complexity
    function getYieldTokens()
        public
        view
        returns (IERC4626[] memory)
    {
        IERC4626[]
            memory yieldTokens = new IERC4626[](numYieldTokens);

        if (numYieldTokens > 0) { yieldTokens[0] = yieldToken0; } else { return yieldTokens; }
        if (numYieldTokens > 1) { yieldTokens[1] = yieldToken1; } else { return yieldTokens; }
        if (numYieldTokens > 2) { yieldTokens[2] = yieldToken2; } else { return yieldTokens; }
        if (numYieldTokens > 3) { yieldTokens[3] = yieldToken3; } else { return yieldTokens; }
        if (numYieldTokens > 4) { yieldTokens[4] = yieldToken4; } else { return yieldTokens; }
        if (numYieldTokens > 5) { yieldTokens[5] = yieldToken5; } else { return yieldTokens; }
        if (numYieldTokens > 6) { yieldTokens[6] = yieldToken6; } else { return yieldTokens; }
        if (numYieldTokens > 7) { yieldTokens[7] = yieldToken7; } else { return yieldTokens; }
        if (numYieldTokens > 8) { yieldTokens[8] = yieldToken8; } else { return yieldTokens; }
        if (numYieldTokens > 9) { yieldTokens[9] = yieldToken9; } else { return yieldTokens; }
        if (numYieldTokens > 10) { yieldTokens[10] = yieldToken10; } else { return yieldTokens; }
        if (numYieldTokens > 11) { yieldTokens[11] = yieldToken11; } else { return yieldTokens; }
        if (numYieldTokens > 12) { yieldTokens[12] = yieldToken12; } else { return yieldTokens; }
        if (numYieldTokens > 13) { yieldTokens[13] = yieldToken13; } else { return yieldTokens; }
        if (numYieldTokens > 14) { yieldTokens[14] = yieldToken14; } else { return yieldTokens; }
        if (numYieldTokens > 15) { yieldTokens[15] = yieldToken15; } else { return yieldTokens; }
        if (numYieldTokens > 16) { yieldTokens[16] = yieldToken16; } else { return yieldTokens; }
        if (numYieldTokens > 17) { yieldTokens[17] = yieldToken17; } else { return yieldTokens; }
        if (numYieldTokens > 18) { yieldTokens[18] = yieldToken18; } else { return yieldTokens; }
        if (numYieldTokens > 19) { yieldTokens[19] = yieldToken19; } else { return yieldTokens; }

        return yieldTokens;
    }

    /// @inheritdoc IYieldTokenStorage
    // prettier-ignore
    // solhint-disable-next-line code-complexity
    function getUnderlyingIndexes() public view returns (uint256[] memory) {
        uint256[] memory underlyingIndexs = new uint256[](numYieldTokens);

        if (numYieldTokens > 0) { underlyingIndexs[0] = underlyingIndex0; } else { return underlyingIndexs; }
        if (numYieldTokens > 1) { underlyingIndexs[1] = underlyingIndex1; } else { return underlyingIndexs; }
        if (numYieldTokens > 2) { underlyingIndexs[2] = underlyingIndex2; } else { return underlyingIndexs; }
        if (numYieldTokens > 3) { underlyingIndexs[3] = underlyingIndex3; } else { return underlyingIndexs; }
        if (numYieldTokens > 4) { underlyingIndexs[4] = underlyingIndex4; } else { return underlyingIndexs; }
        if (numYieldTokens > 5) { underlyingIndexs[5] = underlyingIndex5; } else { return underlyingIndexs; }
        if (numYieldTokens > 6) { underlyingIndexs[6] = underlyingIndex6; } else { return underlyingIndexs; }
        if (numYieldTokens > 7) { underlyingIndexs[7] = underlyingIndex7; } else { return underlyingIndexs; }
        if (numYieldTokens > 8) { underlyingIndexs[8] = underlyingIndex8; } else { return underlyingIndexs; }
        if (numYieldTokens > 9) { underlyingIndexs[9] = underlyingIndex9; } else { return underlyingIndexs; }
        if (numYieldTokens > 10) { underlyingIndexs[10] = underlyingIndex10; } else { return underlyingIndexs; }
        if (numYieldTokens > 11) { underlyingIndexs[11] = underlyingIndex11; } else { return underlyingIndexs; }
        if (numYieldTokens > 12) { underlyingIndexs[12] = underlyingIndex12; } else { return underlyingIndexs; }
        if (numYieldTokens > 13) { underlyingIndexs[13] = underlyingIndex13; } else { return underlyingIndexs; }
        if (numYieldTokens > 14) { underlyingIndexs[14] = underlyingIndex14; } else { return underlyingIndexs; }
        if (numYieldTokens > 15) { underlyingIndexs[15] = underlyingIndex15; } else { return underlyingIndexs; }
        if (numYieldTokens > 16) { underlyingIndexs[16] = underlyingIndex16; } else { return underlyingIndexs; }
        if (numYieldTokens > 17) { underlyingIndexs[17] = underlyingIndex17; } else { return underlyingIndexs; }
        if (numYieldTokens > 18) { underlyingIndexs[18] = underlyingIndex18; } else { return underlyingIndexs; }
        if (numYieldTokens > 19) { underlyingIndexs[19] = underlyingIndex19; } else { return underlyingIndexs; }

        return underlyingIndexs;
    }
}
