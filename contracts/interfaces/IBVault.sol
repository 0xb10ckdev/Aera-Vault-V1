// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

import "../dependencies/openzeppelin/IERC20.sol";

interface IBVault {
    function hasApprovedRelayer(address user, address relayer)
        external
        view
        returns (bool);

    function setRelayerApproval(
        address sender,
        address relayer,
        bool approved
    ) external;

    function getInternalBalance(address user, IERC20[] memory tokens)
        external
        view
        returns (uint256[] memory);

    function manageUserBalance(UserBalanceOp[] memory ops) external payable;

    struct UserBalanceOp {
        UserBalanceOpKind kind;
        IERC20 asset;
        uint256 amount;
        address sender;
        address payable recipient;
    }

    enum UserBalanceOpKind {
        DEPOSIT_INTERNAL,
        WITHDRAW_INTERNAL,
        TRANSFER_INTERNAL,
        TRANSFER_EXTERNAL
    }

    enum PoolSpecialization {
        GENERAL,
        MINIMAL_SWAP_INFO,
        TWO_TOKEN
    }

    function registerPool(PoolSpecialization specialization)
        external
        returns (bytes32);

    function getPool(bytes32 poolId)
        external
        view
        returns (address, PoolSpecialization);

    function registerTokens(
        bytes32 poolId,
        IERC20[] memory tokens,
        address[] memory assetManagers
    ) external;

    function deregisterTokens(bytes32 poolId, IERC20[] memory tokens) external;

    function getPoolTokenInfo(bytes32 poolId, IERC20 token)
        external
        view
        returns (
            uint256 cash,
            uint256 managed,
            uint256 lastChangeBlock,
            address assetManager
        );

    function getPoolTokens(bytes32 poolId)
        external
        view
        returns (
            IERC20[] memory tokens,
            uint256[] memory balances,
            uint256 lastChangeBlock
        );

    function joinPool(
        bytes32 poolId,
        address sender,
        address recipient,
        JoinPoolRequest memory request
    ) external payable;

    struct JoinPoolRequest {
        IERC20[] assets;
        uint256[] maxAmountsIn;
        bytes userData;
        bool fromInternalBalance;
    }

    function exitPool(
        bytes32 poolId,
        address sender,
        address payable recipient,
        ExitPoolRequest memory request
    ) external;

    struct ExitPoolRequest {
        IERC20[] assets;
        uint256[] minAmountsOut;
        bytes userData;
        bool toInternalBalance;
    }

    enum PoolBalanceChangeKind {
        JOIN,
        EXIT
    }

    enum SwapKind {
        GIVEN_IN,
        GIVEN_OUT
    }

    function swap(
        SingleSwap memory singleSwap,
        FundManagement memory funds,
        uint256 limit,
        uint256 deadline
    ) external payable returns (uint256);

    struct SingleSwap {
        bytes32 poolId;
        SwapKind kind;
        IERC20 assetIn;
        IERC20 assetOut;
        uint256 amount;
        bytes userData;
    }

    function batchSwap(
        SwapKind kind,
        BatchSwapStep[] memory swaps,
        IERC20[] memory assets,
        FundManagement memory funds,
        int256[] memory limits,
        uint256 deadline
    ) external payable returns (int256[] memory);

    struct BatchSwapStep {
        bytes32 poolId;
        uint256 assetInIndex;
        uint256 assetOutIndex;
        uint256 amount;
        bytes userData;
    }

    struct FundManagement {
        address sender;
        bool fromInternalBalance;
        address payable recipient;
        bool toInternalBalance;
    }

    function queryBatchSwap(
        SwapKind kind,
        BatchSwapStep[] memory swaps,
        IERC20[] memory assets,
        FundManagement memory funds
    ) external returns (int256[] memory assetDeltas);

    function managePoolBalance(PoolBalanceOp[] memory ops) external;

    struct PoolBalanceOp {
        PoolBalanceOpKind kind;
        bytes32 poolId;
        IERC20 token;
        uint256 amount;
    }

    enum PoolBalanceOpKind {
        WITHDRAW,
        DEPOSIT,
        UPDATE
    }

    function setPaused(bool paused) external;
}
