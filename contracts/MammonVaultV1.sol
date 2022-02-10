// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "./dependencies/openzeppelin/SafeERC20.sol";
import "./dependencies/openzeppelin/IERC20.sol";
import "./dependencies/openzeppelin/IERC165.sol";
import "./dependencies/openzeppelin/Ownable.sol";
import "./dependencies/openzeppelin/ReentrancyGuard.sol";
import "./dependencies/openzeppelin/Math.sol";
import "./dependencies/openzeppelin/SafeCast.sol";
import "./dependencies/openzeppelin/ERC165Checker.sol";
import "./interfaces/IMammonPoolFactoryV1.sol";
import "./interfaces/IBVault.sol";
import "./interfaces/IBManagedPool.sol";
import "./interfaces/IMammonVaultV1.sol";
import "./interfaces/IWithdrawalValidator.sol";

/// @title Risk-managed treasury vault.
/// @notice Managed n-asset vault that supports withdrawals
///         in line with a pre-defined validator contract.
/// @dev Vault owner is the asset owner.
contract MammonVaultV1 is IMammonVaultV1, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;
    using SafeCast for uint256;

    /// STORAGE ///

    uint256 private constant ONE = 10**18;

    /// @notice Minimum period for weight change duration.
    uint256 private constant MINIMUM_WEIGHT_CHANGE_DURATION = 1 days;

    /// @dev Address to represent unset manager in events.
    address private constant UNSET_MANAGER_ADDRESS = address(0);

    /// @notice Largest possible notice period for vault termination (2 months).
    uint256 private constant MAX_NOTICE_PERIOD = 60 days;

    /// @notice Balancer Vault.
    IBVault public immutable bVault;

    /// @notice Balancer Pool.
    IBManagedPool public immutable pool;

    /// @notice Notice period for vault termination (in seconds).
    uint32 public immutable noticePeriod;

    /// @notice Verifies withdraw limits.
    IWithdrawalValidator public immutable validator;

    /// @notice Describes vault purpose and modelling assumptions for differentiating between vaults
    /// @dev string cannot be immutable bytecode but only set in constructor
    string public description;

    /// STORAGE SLOT START ///

    /// @notice Controls vault parameters.
    address public manager;

    /// @notice Timestamp when notice elapses or 0 if not yet set
    uint64 public noticeTimeoutAt;

    /// @notice Indicates that the Vault has been initialized
    bool public initialized;

    /// EVENTS ///

    /// @notice Emitted when the vault is created.
    /// @param factory Balancer Managed Pool factory address.
    /// @param tokens Token addresses.
    /// @param weights Token weights.
    /// @param manager Vault manager address.
    /// @param validator Withdrawal validator contract address.
    /// @param noticePeriod Notice period (in seconds).
    /// @param description Vault description.
    event Created(
        address indexed factory,
        IERC20[] tokens,
        uint256[] weights,
        address manager,
        address validator,
        uint32 noticePeriod,
        string description
    );

    /// @notice Emitted when tokens are deposited.
    /// @param amounts Token amounts.
    /// @param weights Token weights following deposit.
    event Deposit(uint256[] amounts, uint256[] weights);

    /// @notice Emitted when tokens are withdrawn.
    /// @param requestedAmounts Requested token amounts.
    /// @param withdrawnAmounts Withdrawn token amounts.
    /// @param allowances Token withdrawal allowances.
    /// @param weights Token weights following withdrawal.
    event Withdraw(
        uint256[] requestedAmounts,
        uint256[] withdrawnAmounts,
        uint256[] allowances,
        uint256[] weights
    );

    /// @notice Emitted when manager is changed.
    /// @param previousManager Previous manager address.
    /// @param manager New manager address.
    event ManagerChanged(
        address indexed previousManager,
        address indexed manager
    );

    /// @notice Emitted when updateWeightsGradually is called.
    /// @param startTime Start timestamp of updates.
    /// @param endTime End timestamp of updates.
    /// @param weights Target weights of tokens.
    event UpdateWeightsGradually(
        uint256 startTime,
        uint256 endTime,
        uint256[] weights
    );

    /// @notice Emitted when swap is enabled/disabled.
    /// @param swapEnabled New state of swap.
    event SetSwapEnabled(bool swapEnabled);

    /// @notice Emitted when swap fee is updated.
    /// @param swapFee New swap fee.
    event SetSwapFee(uint256 swapFee);

    /// @notice Emitted when initializeFinalization is called.
    /// @param noticeTimeoutAt Timestamp for notice timeout.
    event FinalizationInitialized(uint64 noticeTimeoutAt);

    /// @notice Emitted when vault is finalized.
    /// @param caller Address of finalizer.
    /// @param amounts Returned token amounts.
    event Finalized(address indexed caller, uint256[] amounts);

    /// ERRORS ///

    error Mammon__WeightLengthIsNotSame(
        uint256 tokenLength,
        uint256 weightLength
    );
    error Mammon__AmountLengthIsNotSame(
        uint256 tokenLength,
        uint256 amountLength
    );
    error Mammon__ValidatorIsNotValid(address validator);
    error Mammon__NoticePeriodIsAboveMax(uint256 actual, uint256 max);
    error Mammon__NoticeTimeoutNotElapsed(uint64 noticeTimeoutAt);
    error Mammon__ManagerIsZeroAddress();
    error Mammon__CallerIsNotManager();
    error Mammon__WeightChangeDurationIsBelowMin(uint256 actual, uint256 min);
    error Mammon__WeightIsAboveMax(uint256 actual, uint256 max);
    error Mammon__WeightIsBelowMin(uint256 actual, uint256 min);
    error Mammon__AmountIsBelowMin(uint256 actual, uint256 min);
    error Mammon__AmountExceedAvailable(
        address token,
        uint256 amount,
        uint256 available
    );
    error Mammon__FinalizationNotInitialized();
    error Mammon__VaultNotInitialized();
    error Mammon__VaultIsAlreadyInitialized();
    error Mammon__VaultIsFinalizing();

    /// MODIFIERS ///

    /// @dev Throws if called by any account other than the manager.
    modifier onlyManager() {
        if (msg.sender != manager) {
            revert Mammon__CallerIsNotManager();
        }
        _;
    }

    /// @dev Throws if called before vault is initialized.
    modifier onlyInitialized() {
        if (!initialized) {
            revert Mammon__VaultNotInitialized();
        }
        _;
    }

    /// @dev Throws if called before finalization is initialized.
    modifier nonFinalizing() {
        if (noticeTimeoutAt != 0) {
            revert Mammon__VaultIsFinalizing();
        }
        _;
    }

    /// FUNCTIONS ///

    /// @notice Initialize the contract by deploying new Balancer pool using the provided factory.
    /// @dev First token and second token shouldn't be same. Validator should conform to interface.
    /// @param factory Balancer Managed Pool Factory address.
    /// @param name Name of Pool Token.
    /// @param symbol Symbol of Pool Token.
    /// @param tokens Token addresses.
    /// @param swapFeePercentage Pool swap fee.
    /// @param manager_ Vault manager address.
    /// @param validator_ Withdrawal validator contract address.
    /// @param noticePeriod_ Notice period (in seconds).
    /// @param description_ Simple vault text description.
    constructor(
        address factory,
        string memory name,
        string memory symbol,
        IERC20[] memory tokens,
        uint256[] memory weights,
        uint256 swapFeePercentage,
        address manager_,
        address validator_,
        uint32 noticePeriod_,
        string memory description_
    ) {
        if (tokens.length != weights.length) {
            revert Mammon__WeightLengthIsNotSame(
                tokens.length,
                weights.length
            );
        }
        if (
            !ERC165Checker.supportsInterface(
                validator_,
                type(IWithdrawalValidator).interfaceId
            )
        ) {
            revert Mammon__ValidatorIsNotValid(validator_);
        }
        if (noticePeriod_ > MAX_NOTICE_PERIOD) {
            revert Mammon__NoticePeriodIsAboveMax(
                noticePeriod_,
                MAX_NOTICE_PERIOD
            );
        }

        address[] memory managers = new address[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            managers[i] = address(this);
        }

        pool = IBManagedPool(
            IMammonPoolFactoryV1(factory).create(
                name,
                symbol,
                tokens,
                weights,
                managers,
                swapFeePercentage,
                address(this),
                false,
                true,
                0
            )
        );

        // slither-disable-next-line reentrancy-benign
        bVault = IMammonPoolFactoryV1(factory).getVault();
        manager = manager_;
        validator = IWithdrawalValidator(validator_);
        noticePeriod = noticePeriod_;
        description = description_;

        // slither-disable-next-line reentrancy-events
        emit Created(
            factory,
            tokens,
            weights,
            manager_,
            validator_,
            noticePeriod_,
            description_
        );
        // slither-disable-next-line reentrancy-events
        emit ManagerChanged(UNSET_MANAGER_ADDRESS, manager_);
    }

    /// PROTOCOL API ///

    /// @inheritdoc IProtocolAPI
    function initialDeposit(uint256[] calldata amounts)
        external
        override
        onlyOwner
    {
        if (initialized) {
            revert Mammon__VaultIsAlreadyInitialized();
        }
        initialized = true;

        IERC20[] memory tokens = getTokens();

        if (tokens.length != amounts.length) {
            revert Mammon__AmountLengthIsNotSame(
                tokens.length,
                amounts.length
            );
        }

        /// must encode the userData for join as below
        /// abi.encode(JoinKind.INIT, initBalances)
        /// ManagedPool JoinKinds:
        /// enum JoinKind {
        ///     INIT,
        ///     EXACT_TOKENS_IN_FOR_BPT_OUT,
        ///     TOKEN_IN_FOR_EXACT_BPT_OUT,
        ///     ALL_TOKENS_IN_FOR_EXACT_BPT_OUT
        /// }
        bytes memory initUserData = abi.encode(0, amounts);

        for (uint256 i = 0; i < tokens.length; i++) {
            if (amounts[i] > 0) {
                depositToken(tokens[i], amounts[i]);
            }
        }

        IBVault.JoinPoolRequest memory joinPoolRequest = IBVault
            .JoinPoolRequest({
                assets: tokens,
                maxAmountsIn: amounts,
                userData: initUserData,
                fromInternalBalance: false
            });
        bVault.joinPool(
            getPoolId(),
            address(this),
            address(this),
            joinPoolRequest
        );
    }

    /// @inheritdoc IProtocolAPI
    function deposit(uint256[] calldata amounts)
        external
        override
        nonReentrant
        onlyOwner
        onlyInitialized
        nonFinalizing
    {
        IERC20[] memory tokens;
        uint256[] memory holdings;
        (tokens, holdings, ) = getTokensData();

        if (tokens.length != amounts.length) {
            revert Mammon__AmountLengthIsNotSame(
                tokens.length,
                amounts.length
            );
        }

        uint256[] memory weights = getNormalizedWeights();
        uint256[] memory newWeights = new uint256[](tokens.length);
        uint256 weightSum;

        for (uint256 i = 0; i < amounts.length; i++) {
            if (amounts[i] > 0) {
                depositToken(tokens[i], amounts[i]);

                uint256 newBalance = holdings[i] + amounts[i];
                newWeights[i] = (weights[i] * newBalance) / holdings[i];
            } else {
                newWeights[i] = weights[i];
            }

            weightSum += newWeights[i];
        }

        /// Set managed balance of pool as amounts
        /// i.e. Deposit amounts of tokens to pool from Mammon Vault
        updatePoolBalance(amounts, IBVault.PoolBalanceOpKind.UPDATE);
        /// Decrease managed balance and increase cash balance of pool
        /// i.e. Move amounts from managed balance to cash balance
        updatePoolBalance(amounts, IBVault.PoolBalanceOpKind.DEPOSIT);

        /// It cancels current active weights change schedule
        /// and update weights with newWeights
        updateWeights(newWeights, weightSum);

        // slither-disable-next-line reentrancy-events
        emit Deposit(amounts, getNormalizedWeights());
    }

    /// @inheritdoc IProtocolAPI
    function withdraw(uint256[] calldata amounts)
        external
        override
        nonReentrant
        onlyOwner
        onlyInitialized
        nonFinalizing
    {
        IERC20[] memory tokens;
        uint256[] memory holdings;
        (tokens, holdings, ) = getTokensData();

        if (tokens.length != amounts.length) {
            revert Mammon__AmountLengthIsNotSame(
                tokens.length,
                amounts.length
            );
        }

        uint256[] memory allowances = validator.allowance();
        uint256[] memory weights = getNormalizedWeights();
        uint256[] memory newWeights = new uint256[](tokens.length);

        for (uint256 i = 0; i < tokens.length; i++) {
            if (amounts[i] > holdings[i] || amounts[i] > allowances[i]) {
                revert Mammon__AmountExceedAvailable(
                    address(tokens[i]),
                    amounts[i],
                    holdings[i].min(allowances[i])
                );
            }
        }

        uint256[] memory managed = new uint256[](tokens.length);

        /// Decrease cash balance and increase managed balance of pool
        /// i.e. Move amounts from cash balance to managed balance
        /// and withdraw token amounts from pool to Mammon Vault
        updatePoolBalance(amounts, IBVault.PoolBalanceOpKind.WITHDRAW);
        /// Adjust managed balance of pool as the zero array
        updatePoolBalance(managed, IBVault.PoolBalanceOpKind.UPDATE);

        uint256[] memory withdrawnAmounts = new uint256[](amounts.length);
        uint256 weightSum;

        for (uint256 i = 0; i < amounts.length; i++) {
            if (amounts[i] > 0) {
                withdrawnAmounts[i] = withdrawToken(tokens[i]);

                uint256 newBalance = holdings[i] - amounts[i];
                newWeights[i] = (weights[i] * newBalance) / holdings[i];
            } else {
                newWeights[i] = weights[i];
            }

            weightSum += newWeights[i];
        }

        /// It cancels current active weights change schedule
        /// and update weights with newWeights
        updateWeights(newWeights, weightSum);

        // slither-disable-next-line reentrancy-events
        emit Withdraw(
            amounts,
            withdrawnAmounts,
            allowances,
            getNormalizedWeights()
        );
    }

    /// @inheritdoc IProtocolAPI
    function initializeFinalization()
        external
        override
        onlyOwner
        onlyInitialized
        nonFinalizing
    {
        noticeTimeoutAt = block.timestamp.toUint64() + noticePeriod;
        emit FinalizationInitialized(noticeTimeoutAt);
    }

    /// @inheritdoc IProtocolAPI
    // slither-disable-next-line timestamp
    function finalize() external override nonReentrant onlyOwner {
        if (noticeTimeoutAt == 0) {
            revert Mammon__FinalizationNotInitialized();
        }
        if (noticeTimeoutAt > block.timestamp) {
            revert Mammon__NoticeTimeoutNotElapsed(noticeTimeoutAt);
        }

        uint256[] memory amounts = returnFunds();
        emit Finalized(owner(), amounts);

        selfdestruct(payable(owner()));
    }

    /// @inheritdoc IProtocolAPI
    function setManager(address newManager) external override onlyOwner {
        if (newManager == address(0)) {
            revert Mammon__ManagerIsZeroAddress();
        }
        emit ManagerChanged(manager, newManager);
        manager = newManager;
    }

    /// @inheritdoc IProtocolAPI
    function sweep(address token, uint256 amount) external override onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }

    /// MANAGER API ///

    /// @inheritdoc IManagerAPI
    function updateWeightsGradually(
        uint256[] calldata targetWeights,
        uint256 startTime,
        uint256 endTime
    ) external override onlyManager onlyInitialized nonFinalizing {
        if (endTime - startTime < MINIMUM_WEIGHT_CHANGE_DURATION) {
            revert Mammon__WeightChangeDurationIsBelowMin(
                endTime - startTime,
                MINIMUM_WEIGHT_CHANGE_DURATION
            );
        }

        pool.updateWeightsGradually(startTime, endTime, targetWeights);

        // slither-disable-next-line reentrancy-events
        emit UpdateWeightsGradually(startTime, endTime, targetWeights);
    }

    /// @inheritdoc IManagerAPI
    function setSwapEnabled(bool value)
        external
        override
        onlyManager
        onlyInitialized
    {
        pool.setSwapEnabled(value);
        // slither-disable-next-line reentrancy-events
        emit SetSwapEnabled(value);
    }

    /// @inheritdoc IManagerAPI
    function setSwapFee(uint256 newSwapFee) external override onlyManager {
        pool.setSwapFeePercentage(newSwapFee);
        // slither-disable-next-line reentrancy-events
        emit SetSwapFee(newSwapFee);
    }

    /// MULTI ASSET VAULT INTERFACE ///

    /// @inheritdoc IMultiAssetVault
    function holding(uint256 index) external view override returns (uint256) {
        uint256[] memory amounts = getHoldings();
        return amounts[index];
    }

    /// @inheritdoc IMultiAssetVault
    function getHoldings()
        public
        view
        override
        returns (uint256[] memory amounts)
    {
        (, amounts, ) = getTokensData();
    }

    /// USER API ///

    /// @inheritdoc IUserAPI
    function isSwapEnabled() external view override returns (bool) {
        return pool.getSwapEnabled();
    }

    /// @inheritdoc IUserAPI
    function getSwapFee() external view override returns (uint256) {
        return pool.getSwapFeePercentage();
    }

    /// @inheritdoc IUserAPI
    function getPoolId() public view override returns (bytes32) {
        return pool.getPoolId();
    }

    /// @inheritdoc IUserAPI
    function getTokensData()
        public
        view
        override
        returns (
            IERC20[] memory,
            uint256[] memory,
            uint256
        )
    {
        return bVault.getPoolTokens(getPoolId());
    }

    /// @inheritdoc IUserAPI
    function getTokens()
        public
        view
        override
        returns (IERC20[] memory tokens)
    {
        (tokens, , ) = getTokensData();
    }

    /// @inheritdoc IUserAPI
    function getNormalizedWeights()
        public
        view
        override
        returns (uint256[] memory)
    {
        return pool.getNormalizedWeights();
    }

    /// INTERNAL FUNCTIONS ///

    /// @dev PoolBalanceOpKind has three kinds
    /// Withdrawal - decrease the Pool's cash, but increase its managed balance,
    ///              leaving the total balance unchanged.
    /// Deposit - increase the Pool's cash, but decrease its managed balance,
    ///           leaving the total balance unchanged.
    /// Update - don't affect the Pool's cash balance, but change the managed balance,
    ///          so it does alter the total. The external amount can be either
    ///          increased or decreased by this call (i.e., reporting a gain or a loss).
    function updatePoolBalance(
        uint256[] memory amounts,
        IBVault.PoolBalanceOpKind kind
    ) internal {
        IBVault.PoolBalanceOp[] memory ops = new IBVault.PoolBalanceOp[](
            amounts.length
        );
        bytes32 poolId = getPoolId();
        IERC20[] memory tokens = getTokens();

        for (uint256 i = 0; i < ops.length; i++) {
            ops[i].kind = kind;
            ops[i].poolId = poolId;
            ops[i].token = tokens[i];
            ops[i].amount = amounts[i];
        }

        bVault.managePoolBalance(ops);
    }

    /// @notice Update weights of tokens in the pool.
    /// @dev Will only be called by deposit() and withdraw().
    function updateWeights(uint256[] memory weights, uint256 weightSum)
        internal
    {
        uint256[] memory newWeights = new uint256[](weights.length);

        uint256 adjustedSum;
        for (uint256 i = 0; i < weights.length; i++) {
            newWeights[i] = (weights[i] * ONE) / weightSum;
            adjustedSum += newWeights[i];
        }

        newWeights[0] = newWeights[0] + ONE - adjustedSum;

        uint256 timestamp = block.timestamp;
        pool.updateWeightsGradually(timestamp, timestamp, newWeights);
    }

    /// @notice Deposit token to the pool.
    /// @dev Will only be called by deposit().
    /// @param token Address of the token to deposit.
    /// @param amount Amount to deposit.
    function depositToken(IERC20 token, uint256 amount) internal {
        token.safeTransferFrom(owner(), address(this), amount);
        token.safeApprove(address(bVault), amount);
    }

    /// @notice Withdraw token from the pool.
    /// @dev Will only be called by withdraw() and returnFunds().
    /// @param token Address of the token to withdraw.
    /// @param amount Amount to withdraw.
    function withdrawToken(IERC20 token) internal returns (uint256 amount) {
        // slither-disable-next-line calls-loop
        amount = token.balanceOf(address(this));
        token.safeTransfer(owner(), amount);
    }

    /// @notice Return all funds to owner.
    /// @dev Will only be called by finalize().
    /// @return amounts Exact returned amount of tokens.
    function returnFunds() internal returns (uint256[] memory amounts) {
        uint256[] memory holdings = getHoldings();

        IERC20[] memory tokens = getTokens();
        uint256[] memory managed = new uint256[](tokens.length);

        updatePoolBalance(holdings, IBVault.PoolBalanceOpKind.WITHDRAW);
        updatePoolBalance(managed, IBVault.PoolBalanceOpKind.UPDATE);

        amounts = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            amounts[i] = withdrawToken(tokens[i]);
        }
    }
}
