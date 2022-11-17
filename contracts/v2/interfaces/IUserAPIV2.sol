// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../../v1/dependencies/openzeppelin/IERC20.sol";

/// @title Vault public interface.
/// @notice Interface for vault arbitrageurs and other observers.
interface IUserAPIV2 {
    /// @notice Get Token Data of Vault.
    /// @return tokens IERC20 tokens of Vault.
    /// @return balances Balances of tokens of Vault.
    /// @return lastChangeBlock Last updated Blocknumber.
    function getTokensData()
        external
        view
        returns (
            IERC20[] memory tokens,
            uint256[] memory balances,
            uint256 lastChangeBlock
        );

    /// @notice Get IERC20 Tokens of Vault.
    /// @return tokens IERC20 tokens of Vault.
    function getTokens() external view returns (IERC20[] memory);

    /// @notice Get token weights.
    /// @return Normalized weights of tokens in Vault.
    function getNormalizedWeights() external view returns (uint256[] memory);
}
