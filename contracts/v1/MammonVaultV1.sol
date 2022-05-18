// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "./dependencies/openzeppelin/SafeERC20.sol";
import "./dependencies/openzeppelin/IERC20.sol";
import "./dependencies/openzeppelin/Ownable.sol";
import "./dependencies/openzeppelin/ReentrancyGuard.sol";
import "./dependencies/openzeppelin/Math.sol";
import "./dependencies/openzeppelin/SafeCast.sol";
import "./dependencies/openzeppelin/ERC165Checker.sol";
import "./interfaces/IBManagedPoolFactory.sol";
import "./interfaces/IBVault.sol";
import "./interfaces/IBManagedPool.sol";
import "./interfaces/IMammonVaultV1.sol";
import "./interfaces/IWithdrawalValidator.sol";

/// @title Risk-managed treasury vault.
/// @notice Managed n-asset vault that supports withdrawals
///         in line with a pre-defined validator contract.
/// @dev Vault owner is the asset owner.
contract MammonVaultV1 is IMammonVaultV1, Ownable, ReentrancyGuard {
    using SafeMath for IERC20;
    using SafeCast for uint256;

    /// STORAGE ///

    uint256 private constant ONE = 10**18;

    /// @notice Minimum period for weight change duration.
    uint256 private constant MINIMUM_WEIGHT_CHANGE_DURATION = 1 days;

    /// @notice Maximum absolute change in swap fee.
    uint256 private constant MAXIMUM_SWAP_FEE_PERCENT_CHANGE = 0.0005e18;

    /// @dev Address to represent unset manager in events.
    address private constant UNSET_MANAGER_ADDRESS = address(0);

    /// @notice Largest possible notice period for vault termination (2 months).
    uint256 private constant MAX_NOTICE_PERIOD = 60 days;

    /// @notice Largest possible weight change ratio per one second.
    /// @dev It's the increment/decrement factor per one second.
    ///      increment/decrement factor per n seconds: Fn = f * n
    ///      Weight growth range for n seconds: [1 / Fn - 1, Fn - 1]
    ///      E.g. increment/decrement factor per 2000 seconds is 2
    ///      Weight growth range for 2000 seconds is [-50%, 100%]
    uint256 private constant MAX_WEIGHT_CHANGE_RATIO = 10**15;

    /// @notice Largest management fee earned proportion per one second.
    /// @dev 0.0000001% per second, i.e. 3.1536% per year.
    ///      0.0000001% * (365 * 24 * 60 * 60) = 3.1536%
    uint256 private constant MAX_MANAGEMENT_FEE = 10**9;

    /// @notice Balancer Vault.
    IBVault public immutable bVault;

    /// @notice Balancer Pool.
    IBManagedPool public immutable pool;

    /// @notice Pool ID of Balancer pool on Vault.
    bytes32 public immutable poolId;

    /// @notice Notice period for vault termination (in seconds).
    uint32 public immutable noticePeriod;

    /// @notice Verifies withdraw limits.
    IWithdrawalValidator public immutable validator;

    /// @notice Management fee earned proportion per second.
    /// @dev 10**18 is 100%
    uint256 public immutable managementFee;

    /// STORAGE SLOT START ///

    /// @notice Describes vault purpose and modelling assumptions for differentiating between vaults
    /// @dev string cannot be immutable bytecode but only set in constructor
    string public description;

    /// @notice Controls vault parameters.
    address public manager;

    /// @notice Pending account to accept ownership of vault.
    address public pendingOwner;

    /// @notice Timestamp when notice elapses or 0 if not yet set
    uint64 public noticeTimeoutAt;

    /// @notice Indicates that the Vault has been initialized
    bool public initialized;

    /// @notice Indicates that the Vault has been finalized
    bool public finalized;

    /// @notice Last timestamp where manager fee index was locked.
    uint64 public lastFeeCheckpoint = type(uint64).max;

    /// @notice Manager fee earned proportion
    uint256 public managerFeeIndex;

    /// EVENTS ///

    /// @notice Emitted when the vault is created.
    /// @param factory Balancer Managed Pool factory address.
    /// @param name Name of Pool Token.
    /// @param symbol Symbol of Pool Token.
    /// @param tokens Token addresses.
    /// @param weights Token weights.
    /// @param swapFeePercentage Pool swap fee.
    /// @param manager Vault manager address.
    /// @param validator Withdrawal validator contract address.
    /// @param noticePeriod Notice period (in seconds).
    /// @param managementFee Management fee earned proportion per second.
    /// @param description Vault description.
    event Created(
        address indexed factory,
        string name,
        string symbol,
        IERC20[] tokens,
        uint256[] weights,
        uint256 swapFeePercentage,
        address indexed manager,
        address indexed validator,
        uint32 noticePeriod,
        uint256 managementFee,
        string description
    );

    /// @notice Emitted when tokens are deposited.
    /// @param amounts Token amounts.
    /// @param weights Token weights following deposit.
    event Deposit(uint256[] amounts, uint256[] weights);

    /// @notice Emitted when tokens are withdrawn.
    /// @param requestedAmounts Requested token amounts.
    /// @param allowances Token withdrawal allowances.
    /// @param weights Token weights following withdrawal.
    event Withdraw(
        uint256[] requestedAmounts,
        uint256[] allowances,
        uint256[] weights
    );

    /// @notice Emitted when management fees are withdrawn.
    /// @param manager Manager address.
    /// @param amounts Withdrawn amounts.
    event DistributeManagerFees(address indexed manager, uint256[] amounts);

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

    /// @notice Emitted when cancelWeightUpdates is called.
    /// @param weights Current weights of tokens.
    event CancelWeightUpdates(uint256[] weights);

    /// @notice Emitted when swap is enabled/disabled.
    /// @param swapEnabled New state of swap.
    event SetSwapEnabled(bool swapEnabled);

    /// @notice Emitted when enableTradingWithWeights is called.
    /// @param time timestamp of updates.
    /// @param weights Target weights of tokens.
    event EnabledTradingWithWeights(uint256 time, uint256[] weights);

    /// @notice Emitted when swap fee is updated.
    /// @param swapFee New swap fee.
    event SetSwapFee(uint256 swapFee);

    /// @notice Emitted when initiateFinalization is called.
    /// @param noticeTimeoutAt Timestamp for notice timeout.
    event FinalizationInitiated(uint64 noticeTimeoutAt);

    /// @notice Emitted when vault is finalized.
    /// @param caller Address of finalizer.
    /// @param amounts Returned token amounts.
    event Finalized(address indexed caller, uint256[] amounts);

    /// @notice Emitted when transferOwnership is called.
    /// @param currentOwner Address of current owner.
    /// @param pendingOwner Address of pending owner.
    event OwnershipTransferOffered(
        address indexed currentOwner,
        address indexed pendingOwner
    );

    /// @notice Emitted when cancelOwnershipTransfer is called.
    /// @param currentOwner Address of current owner.
    /// @param canceledOwner Address of canceled owner.
    event OwnershipTransferCanceled(
        address indexed currentOwner,
        address indexed canceledOwner
    );

    /// ERRORS ///

    error Mammon__WeightLengthIsNotSame(uint256 numTokens, uint256 numWeights);
    error Mammon__AmountLengthIsNotSame(uint256 numTokens, uint256 numAmounts);
    error Mammon__ValidatorIsNotMatched(
        uint256 numTokens,
        uint256 numAllowances
    );
    error Mammon__ValidatorIsNotValid(address validator);
    error Mammon__ManagementFeeIsAboveMax(uint256 actual, uint256 max);
    error Mammon__NoticePeriodIsAboveMax(uint256 actual, uint256 max);
    error Mammon__NoticeTimeoutNotElapsed(uint64 noticeTimeoutAt);
    error Mammon__ManagerIsZeroAddress();
    error Mammon__CallerIsNotManager();
    error Mammon__SwapFeePercentageChangeIsAboveMax(
        uint256 actual,
        uint256 max
    );
    error Mammon__CallerIsNotOwnerOrManager();
    error Mammon__WeightChangeDurationIsBelowMin(uint256 actual, uint256 min);
    error Mammon__WeightChangeRatioIsAboveMax(
        address token,
        uint256 actual,
        uint256 max
    );
    error Mammon__WeightIsAboveMax(uint256 actual, uint256 max);
    error Mammon__WeightIsBelowMin(uint256 actual, uint256 min);
    error Mammon__AmountIsBelowMin(uint256 actual, uint256 min);
    error Mammon__AmountExceedAvailable(
        address token,
        uint256 amount,
        uint256 available
    );
    error Mammon__CannotSweepPoolToken();
    error Mammon__PoolSwapIsAlreadyEnabled();
    error Mammon__FinalizationNotInitiated();
    error Mammon__VaultNotInitialized();
    error Mammon__VaultIsAlreadyInitialized();
    error Mammon__VaultIsFinalizing();
    error Mammon__VaultIsAlreadyFinalized();
    error Mammon__VaultIsNotRenounceable();
    error Mammon__OwnerIsZeroAddress();
    error Mammon__NotPendingOwner();
    error Mammon__NoPendingOwnershipTransfer();

    /// MODIFIERS ///

    /// @dev Throws if called by any account other than the manager.
    modifier onlyManager() {
        if (msg.sender != manager) {
            revert Mammon__CallerIsNotManager();
        }
        _;
    }

    /// @dev Throws if called by any account other than the owner or manager.
    modifier onlyOwnerOrManager() {
        if (msg.sender != owner() && msg.sender != manager) {
            revert Mammon__CallerIsNotOwnerOrManager();
        }
        _;
    }

    /// @dev Throws if called before vault is initialized.
    modifier whenInitialized() {
        if (!initialized) {
            revert Mammon__VaultNotInitialized();
        }
        _;
    }

    /// @dev Throws if called before finalization is initiated.
    modifier whenNotFinalizing() {
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
    /// @param weights Token weights.
    /// @param swapFeePercentage Pool swap fee.
    /// @param manager_ Vault manager address.
    /// @param validator_ Withdrawal validator contract address.
    /// @param noticePeriod_ Notice period (in seconds).
    /// @param managementFee_ Management fee earned proportion per second.
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
        uint256 managementFee_,
        string memory description_
    ) {
        uint256 numTokens = tokens.length;

        if (numTokens != weights.length) {
            revert Mammon__WeightLengthIsNotSame(numTokens, weights.length);
        }
        if (
            !ERC165Checker.supportsInterface(
                validator_,
                type(IWithdrawalValidator).interfaceId
            )
        ) {
            revert Mammon__ValidatorIsNotValid(validator_);
        }
        // Use new block to avoid stack too deep issue
        {
            uint256 numAllowances = IWithdrawalValidator(validator_)
                .allowance()
                .length;
            if (numAllowances != numTokens) {
                revert Mammon__ValidatorIsNotMatched(numTokens, numAllowances);
            }
        }
        if (managementFee_ > MAX_MANAGEMENT_FEE) {
            revert Mammon__ManagementFeeIsAboveMax(
                managementFee_,
                MAX_MANAGEMENT_FEE
            );
        }
        if (noticePeriod_ > MAX_NOTICE_PERIOD) {
            revert Mammon__NoticePeriodIsAboveMax(
                noticePeriod_,
                MAX_NOTICE_PERIOD
            );
        }
        if (manager_ == address(0)) {
            revert Mammon__ManagerIsZeroAddress();
        }

        address[] memory assetManagers = new address[](numTokens);
        for (uint256 i = 0; i < numTokens; i++) {
            assetManagers[i] = address(this);
        }

        pool = IBManagedPool(
            IBManagedPoolFactory(factory).create(
                IBManagedPoolFactory.NewPoolParams({
                    vault: IBVault(address(0)),
                    name: name,
                    symbol: symbol,
                    tokens: tokens,
                    normalizedWeights: weights,
                    assetManagers: assetManagers,
                    swapFeePercentage: swapFeePercentage,
                    pauseWindowDuration: 0,
                    bufferPeriodDuration: 0,
                    owner: address(this),
                    swapEnabledOnStart: false,
                    mustAllowlistLPs: true,
                    managementSwapFeePercentage: 0
                })
            )
        );

        // slither-disable-next-line reentrancy-benign
        poolId = pool.getPoolId();
        bVault = IBManagedPoolFactory(factory).getVault();
        manager = manager_;
        validator = IWithdrawalValidator(validator_);
        noticePeriod = noticePeriod_;
        description = description_;
        managementFee = managementFee_;

        // slither-disable-next-line reentrancy-events
        emit Created(
            factory,
            name,
            symbol,
            tokens,
            weights,
            swapFeePercentage,
            manager_,
            validator_,
            noticePeriod_,
            managementFee_,
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
        lastFeeCheckpoint = block.timestamp.toUint64();

        IERC20[] memory tokens = getTokens();
        uint256 numTokens = tokens.length;

        if (numTokens != amounts.length) {
            revert Mammon__AmountLengthIsNotSame(numTokens, amounts.length);
        }

        bytes memory initUserData = abi.encode(IBVault.JoinKind.INIT, amounts);

        for (uint256 i = 0; i < numTokens; i++) {
            depositToken(tokens[i], amounts[i]);
        }

        IBVault.JoinPoolRequest memory joinPoolRequest = IBVault
            .JoinPoolRequest({
                assets: tokens,
                maxAmountsIn: amounts,
                userData: initUserData,
                fromInternalBalance: false
            });
        bVault.joinPool(poolId, address(this), address(this), joinPoolRequest);

        setSwapEnabled(true);
    }

    /// @inheritdoc IProtocolAPI
    function deposit(uint256[] calldata amounts)
        external
        override
        nonReentrant
        onlyOwner
        whenInitialized
        whenNotFinalizing
    {
        calculateAndDistributeManagerFees();

        IERC20[] memory tokens;
        uint256[] memory holdings;
        (tokens, holdings, ) = getTokensData();
        uint256 numTokens = tokens.length;

        if (numTokens != amounts.length) {
            revert Mammon__AmountLengthIsNotSame(numTokens, amounts.length);
        }

        uint256[] memory weights = pool.getNormalizedWeights();
        uint256[] memory newWeights = new uint256[](numTokens);
        uint256 weightSum;

        for (uint256 i = 0; i < numTokens; i++) {
            if (amounts[i] != 0) {
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
        emit Deposit(amounts, pool.getNormalizedWeights());
    }

    /// @inheritdoc IProtocolAPI
    function withdraw(uint256[] calldata amounts)
        external
        override
        nonReentrant
        onlyOwner
        whenInitialized
        whenNotFinalizing
    {
        calculateAndDistributeManagerFees();

        IERC20[] memory tokens;
        uint256[] memory holdings;
        (tokens, holdings, ) = getTokensData();
        uint256 numTokens = tokens.length;

        if (numTokens != amounts.length) {
            revert Mammon__AmountLengthIsNotSame(numTokens, amounts.length);
        }

        uint256[] memory allowances = validator.allowance();
        uint256[] memory weights = pool.getNormalizedWeights();
        uint256[] memory newWeights = new uint256[](numTokens);

        for (uint256 i = 0; i < numTokens; i++) {
            if (amounts[i] > holdings[i] || amounts[i] > allowances[i]) {
                revert Mammon__AmountExceedAvailable(
                    address(tokens[i]),
                    amounts[i],
                    Math.min(holdings[i], allowances[i])
                );
            }
        }

        withdrawFromPool(amounts);

        uint256 weightSum;

        for (uint256 i = 0; i < numTokens; i++) {
            if (amounts[i] != 0) {
                tokens[i].safeTransfer(owner(), amounts[i]);

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
        emit Withdraw(amounts, allowances, pool.getNormalizedWeights());
    }

    /// @inheritdoc IProtocolAPI
    function initiateFinalization()
        external
        override
        nonReentrant
        onlyOwner
        whenInitialized
        whenNotFinalizing
    {
        calculateAndDistributeManagerFees();
        noticeTimeoutAt = block.timestamp.toUint64() + noticePeriod;
        setSwapEnabled(false);
        emit FinalizationInitiated(noticeTimeoutAt);
    }

    /// @inheritdoc IProtocolAPI
    // slither-disable-next-line timestamp
    function finalize()
        external
        override
        nonReentrant
        onlyOwner
        whenInitialized
    {
        if (finalized) {
            revert Mammon__VaultIsAlreadyFinalized();
        }
        if (noticeTimeoutAt == 0) {
            revert Mammon__FinalizationNotInitiated();
        }
        if (noticeTimeoutAt > block.timestamp) {
            revert Mammon__NoticeTimeoutNotElapsed(noticeTimeoutAt);
        }

        finalized = true;

        uint256[] memory amounts = returnFunds();
        emit Finalized(owner(), amounts);
    }

    /// @inheritdoc IProtocolAPI
    // slither-disable-next-line timestamp
    function setManager(address newManager)
        external
        override
        nonReentrant
        onlyOwner
    {
        if (newManager == address(0)) {
            revert Mammon__ManagerIsZeroAddress();
        }

        if (initialized && noticeTimeoutAt == 0) {
            calculateAndDistributeManagerFees();
        }

        emit ManagerChanged(manager, newManager);
        manager = newManager;
    }

    /// @inheritdoc IProtocolAPI
    function sweep(address token, uint256 amount) external override onlyOwner {
        if (token == address(pool)) {
            revert Mammon__CannotSweepPoolToken();
        }
        IERC20(token).safeTransfer(owner(), amount);
    }

    /// @inheritdoc IProtocolAPI
    function enableTradingRiskingArbitrage()
        external
        override
        onlyOwner
        whenInitialized
    {
        setSwapEnabled(true);
    }

    /// @inheritdoc IProtocolAPI
    function enableTradingWithWeights(uint256[] calldata weights)
        external
        override
        onlyOwner
        whenInitialized
    {
        if (pool.getSwapEnabled()) {
            revert Mammon__PoolSwapIsAlreadyEnabled();
        }

        pool.updateWeightsGradually(block.timestamp, block.timestamp, weights);
        pool.setSwapEnabled(true);
        // slither-disable-next-line reentrancy-events
        emit EnabledTradingWithWeights(block.timestamp, weights);
    }

    /// @inheritdoc IProtocolAPI
    function disableTrading()
        external
        override
        onlyOwnerOrManager
        whenInitialized
    {
        setSwapEnabled(false);
    }

    /// MANAGER API ///

    /// @inheritdoc IManagerAPI
    // prettier-ignore
    // slither-disable-next-line timestamp
    function updateWeightsGradually(
        uint256[] calldata targetWeights,
        uint256 startTime,
        uint256 endTime
    )
        external
        override
        onlyManager
        whenInitialized
        whenNotFinalizing
    {
        if (
            Math.max(block.timestamp, startTime) +
                MINIMUM_WEIGHT_CHANGE_DURATION >
            endTime
        ) {
            revert Mammon__WeightChangeDurationIsBelowMin(
                endTime - startTime,
                MINIMUM_WEIGHT_CHANGE_DURATION
            );
        }

        // Check if weight change ratio is exceeded
        uint256 targetWeightLength = targetWeights.length;
        uint256[] memory weights = pool.getNormalizedWeights();
        IERC20[] memory tokens = getTokens();
        uint256 duration = endTime - startTime;
        uint256 maximumRatio = MAX_WEIGHT_CHANGE_RATIO * duration;
        for (uint256 i = 0; i < targetWeightLength; i++) {
            uint256 changeRatio = getWeightChangeRatio(
                weights[i],
                targetWeights[i]
            );

            if (changeRatio > maximumRatio) {
                revert Mammon__WeightChangeRatioIsAboveMax(
                    address(tokens[i]),
                    changeRatio,
                    maximumRatio
                );
            }
        }

        pool.updateWeightsGradually(startTime, endTime, targetWeights);

        // slither-disable-next-line reentrancy-events
        emit UpdateWeightsGradually(startTime, endTime, targetWeights);
    }

    /// @inheritdoc IManagerAPI
    function cancelWeightUpdates()
        external
        override
        onlyManager
        whenInitialized
        whenNotFinalizing
    {
        uint256[] memory weights = pool.getNormalizedWeights();
        uint256 numWeights = weights.length;
        uint256 weightSum;

        for (uint256 i = 0; i < numWeights; i++) {
            weightSum += weights[i];
        }

        updateWeights(weights, weightSum);

        // slither-disable-next-line reentrancy-events
        emit CancelWeightUpdates(weights);
    }

    /// @inheritdoc IManagerAPI
    function setSwapFee(uint256 newSwapFee) external override onlyManager {
        uint256 oldSwapFee = pool.getSwapFeePercentage();

        uint256 absoluteDelta = (newSwapFee > oldSwapFee)
            ? newSwapFee - oldSwapFee
            : oldSwapFee - newSwapFee;
        if (absoluteDelta > MAXIMUM_SWAP_FEE_PERCENT_CHANGE) {
            revert Mammon__SwapFeePercentageChangeIsAboveMax(
                absoluteDelta,
                MAXIMUM_SWAP_FEE_PERCENT_CHANGE
            );
        }

        pool.setSwapFeePercentage(newSwapFee);
        // slither-disable-next-line reentrancy-events
        emit SetSwapFee(newSwapFee);
    }

    /// @inheritdoc IManagerAPI
    function claimManagerFees()
        external
        override
        nonReentrant
        whenInitialized
        whenNotFinalizing
        onlyManager
    {
        calculateAndDistributeManagerFees();
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
        return bVault.getPoolTokens(poolId);
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
        external
        view
        override
        returns (uint256[] memory)
    {
        return pool.getNormalizedWeights();
    }

    /// @notice Disable ownership renounceable
    function renounceOwnership() public override onlyOwner {
        revert Mammon__VaultIsNotRenounceable();
    }

    /// @inheritdoc IProtocolAPI
    function transferOwnership(address newOwner)
        public
        override(IProtocolAPI, Ownable)
        onlyOwner
    {
        if (newOwner == address(0)) {
            revert Mammon__OwnerIsZeroAddress();
        }
        pendingOwner = newOwner;
        emit OwnershipTransferOffered(owner(), newOwner);
    }

    /// @inheritdoc IProtocolAPI
    function cancelOwnershipTransfer() external override onlyOwner {
        if (pendingOwner == address(0)) {
            revert Mammon__NoPendingOwnershipTransfer();
        }
        emit OwnershipTransferCanceled(owner(), pendingOwner);
        pendingOwner = address(0);
    }

    /// @inheritdoc IUserAPI
    function acceptOwnership() external override {
        if (msg.sender != pendingOwner) {
            revert Mammon__NotPendingOwner();
        }
        _transferOwnership(pendingOwner);
        pendingOwner = address(0);
    }

    /// INTERNAL FUNCTIONS ///

    /// @notice Calculate manager fee index.
    function updateManagerFeeIndex() internal {
        managerFeeIndex +=
            (block.timestamp - lastFeeCheckpoint) *
            managementFee;
        lastFeeCheckpoint = block.timestamp.toUint64();
    }

    /// @notice Withdraw tokens from Balancer Pool to Mammon Vault
    /// @dev Will only be called by withdraw(), returnFunds
    ///      and calculateAndDistributeManagerFees()
    function withdrawFromPool(uint256[] memory amounts) internal {
        uint256[] memory managed = new uint256[](amounts.length);

        /// Decrease cash balance and increase managed balance of pool
        /// i.e. Move amounts from cash balance to managed balance
        /// and withdraw token amounts from pool to Mammon Vault
        updatePoolBalance(amounts, IBVault.PoolBalanceOpKind.WITHDRAW);
        /// Adjust managed balance of pool as the zero array
        updatePoolBalance(managed, IBVault.PoolBalanceOpKind.UPDATE);
    }

    /// @notice Calculate manager fee index and distribute.
    /// @dev Will only be called by claimManagerFees(), setManager(),
    ///      initiateFinalization(), deposit() and withdraw().
    // slither-disable-next-line timestamp
    function calculateAndDistributeManagerFees() internal {
        updateManagerFeeIndex();

        // slither-disable-next-line incorrect-equality
        if (managerFeeIndex == 0) {
            return;
        }

        IERC20[] memory tokens;
        uint256[] memory holdings;
        (tokens, holdings, ) = getTokensData();

        uint256 numTokens = tokens.length;
        uint256[] memory amounts = new uint256[](numTokens);

        for (uint256 i = 0; i < numTokens; i++) {
            amounts[i] = (holdings[i] * managerFeeIndex) / ONE;
        }

        managerFeeIndex = 0;

        withdrawFromPool(amounts);

        for (uint256 i = 0; i < numTokens; i++) {
            tokens[i].safeTransfer(manager, amounts[i]);
        }

        // slither-disable-next-line reentrancy-events
        emit DistributeManagerFees(manager, amounts);
    }

    /// @notice Calculate change ratio for weight upgrade.
    /// @dev Will only be called by updateWeightsGradually().
    /// @param weight Current weight.
    /// @param targetWeight Target weight.
    /// @return Change ratio(>1) from current weight to target weight.
    function getWeightChangeRatio(uint256 weight, uint256 targetWeight)
        internal
        pure
        returns (uint256)
    {
        return
            weight > targetWeight
                ? (ONE * weight) / targetWeight
                : (ONE * targetWeight) / weight;
    }

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
        uint256 numAmounts = amounts.length;
        IBVault.PoolBalanceOp[] memory ops = new IBVault.PoolBalanceOp[](
            numAmounts
        );
        IERC20[] memory tokens = getTokens();

        for (uint256 i = 0; i < numAmounts; i++) {
            ops[i].kind = kind;
            ops[i].poolId = poolId;
            ops[i].token = tokens[i];
            ops[i].amount = amounts[i];
        }

        bVault.managePoolBalance(ops);
    }

    /// @notice Update weights of tokens in the pool.
    /// @dev Will only be called by deposit(), withdraw() and cancelWeightUpdates().
    function updateWeights(uint256[] memory weights, uint256 weightSum)
        internal
    {
        uint256 numWeights = weights.length;
        uint256[] memory newWeights = new uint256[](numWeights);

        uint256 adjustedSum;
        for (uint256 i = 0; i < numWeights; i++) {
            newWeights[i] = (weights[i] * ONE) / weightSum;
            adjustedSum += newWeights[i];
        }

        newWeights[0] = newWeights[0] + ONE - adjustedSum;

        pool.updateWeightsGradually(
            block.timestamp,
            block.timestamp,
            newWeights
        );
    }

    /// @notice Deposit token to the pool.
    /// @dev Will only be called by deposit().
    /// @param token Address of the token to deposit.
    /// @param amount Amount to deposit.
    function depositToken(IERC20 token, uint256 amount) internal {
        token.safeTransferFrom(owner(), address(this), amount);
        token.safeApprove(address(bVault), amount);
    }

    /// @notice Return all funds to owner.
    /// @dev Will only be called by finalize().
    /// @return amounts Exact returned amount of tokens.
    function returnFunds() internal returns (uint256[] memory amounts) {
        IERC20[] memory tokens;
        uint256[] memory holdings;
        (tokens, holdings, ) = getTokensData();

        uint256 numTokens = tokens.length;
        amounts = new uint256[](numTokens);

        withdrawFromPool(holdings);

        uint256 amount;
        IERC20 token;
        for (uint256 i = 0; i < numTokens; i++) {
            token = tokens[i];
            amount = token.balanceOf(address(this));
            token.safeTransfer(owner(), amount);
            amounts[i] = amount;
        }
    }

    /// @notice Enable or disable swap.
    /// @dev Will only be called by enableTradingRiskingArbitrage(), enableTradingWithWeights()
    ///      and disableTrading().
    /// @param swapEnabled Swap status.
    function setSwapEnabled(bool swapEnabled) internal {
        pool.setSwapEnabled(swapEnabled);
        // slither-disable-next-line reentrancy-events
        emit SetSwapEnabled(swapEnabled);
    }
}
