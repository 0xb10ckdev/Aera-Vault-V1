// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

/// @dev This code is not audited or tested. Please do not use in production.
interface IManagerAPI {
    /// @notice Emitted when public swap is turned on/off.
    /// @param value New state of public swap.
    function setPublicSwap(bool value) external;

    /// @notice Set target weights of tokens and update period.
    /// @dev Available only to the manager. Available only if the vault is initialized.
    ///      Vault shouldn't be on finalizing.
    /// @param weight0 The target weight of the first token.
    /// @param weight1 The target weight of the second token.
    /// @param startBlock The block number that update starts.
    /// @param endBlock The block number that weights reach out target.
    function updateWeightsGradually(
        uint256 weight0,
        uint256 weight1,
        uint256 startBlock,
        uint256 endBlock
    ) external;

    /// @notice Update weights according to plan.
    /// @dev Available only to the manager. Available only if the vault is initialized.
    ///      Vault shouldn't be on finalizing.
    function pokeWeights() external;

    /// @notice Set swap fee.
    /// @dev Available only to the manager.
    function setSwapFee(uint256 newSwapFee) external;
}
