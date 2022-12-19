// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "./dependencies/openzeppelin/IERC20.sol";
import "./dependencies/openzeppelin/Math.sol";
import "./dependencies/openzeppelin/Multicall.sol";
import "./dependencies/openzeppelin/Ownable.sol";
import "./dependencies/openzeppelin/ReentrancyGuard.sol";
import "./dependencies/openzeppelin/SafeERC20.sol";
import "./interfaces/IAeraVaultV2.sol";
import "./interfaces/IBManagedPool.sol";
import "./interfaces/IBManagedPoolFactory.sol";
import "./interfaces/IBMerkleOrchard.sol";
import "./interfaces/IBVault.sol";
import "./dependencies/chainlink/interfaces/AggregatorV2V3Interface.sol";
import "./OracleStorage.sol";
import "./YieldTokenStorage.sol";

/// @title Risk-managed treasury vault.
/// @notice Managed n-asset vault with ERC20 tokens held
///         in a Balancer pool and ERC4626 tokens held directly.
///         A vault manager recommends weight changes that translate
///         into Balancer weight updates and deposits/withdrawals
///         in the underlying ERC4626 vaults.
/// @dev Vault owner is the asset owner.
contract AeraVaultV2 is
    IAeraVaultV2,
    OracleStorage,
    YieldTokenStorage,
    Multicall,
    Ownable,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;
    using SafeERC20 for IERC4626;

    /// STORAGE ///

    uint256 internal constant ONE = 10**18;

    /// @notice Mininum weight of pool tokens in Balancer Pool.
    uint256 private constant MIN_WEIGHT = 0.01e18;

    /// @notice Minimum period for weight change duration.
    uint256 private constant MINIMUM_WEIGHT_CHANGE_DURATION = 4 hours;

    /// @notice Maximum absolute change in swap fee.
    uint256 private constant MAXIMUM_SWAP_FEE_PERCENT_CHANGE = 0.005e18;

    /// @dev Address to represent unset manager in events.
    address private constant UNSET_MANAGER_ADDRESS = address(0);

    /// @notice Cooldown period for updating swap fee (1 minute).
    uint256 private constant SWAP_FEE_COOLDOWN_PERIOD = 1 minutes;

    /// @notice Largest possible weight change ratio per second.
    /// @dev The increment/decrement factor per one second.
    ///      Increment/decrement factor per n seconds: Fn = f * n
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

    /// @notice Balancer Managed Pool.
    IBManagedPool public immutable pool;

    /// @notice Balancer Merkle Orchard.
    IBMerkleOrchard public immutable merkleOrchard;

    /// @notice Pool ID of Balancer Pool on Vault.
    bytes32 public immutable poolId;

    /// @notice Number of pool tokens.
    uint256 public immutable numPoolTokens;

    /// @notice Number of pool tokens and yield tokens.
    uint256 public immutable numTokens;

    /// @notice Timestamp when the vault was created.
    uint256 public immutable createdAt;

    /// @notice Minimum period to charge a guaranteed management fee.
    uint256 public immutable minFeeDuration;

    /// @notice Minimum reliable vault TVL measured in base token terms.
    uint256 public immutable minReliableVaultValue;

    /// @notice Minimum significant deposit value measured in base token terms.
    uint256 public immutable minSignificantDepositValue;

    /// @notice Maximum oracle spot price divergence.
    uint256 public immutable maxOracleSpotDivergence;

    /// @notice Maximum update delay of oracles.
    uint256 public immutable maxOracleDelay;

    /// @notice Management fee earned proportion per second.
    /// @dev 10**18 is 100%
    uint256 public immutable managementFee;

    /// STORAGE SLOT START ///

    /// @notice Describes vault purpose and modeling assumptions for differentiating between vaults.
    /// @dev string cannot be immutable bytecode but only set in constructor.
    string public description;

    /// @notice Indicates that the Vault has been initialized.
    bool public initialized;

    /// @notice Indicates that the Vault has been finalized.
    bool public finalized;

    /// @notice True if oracle prices are enabled.
    bool public oraclesEnabled = true;

    /// @notice Submits vault parameters.
    address public manager;

    /// @notice Pending account to accept ownership of vault.
    address public pendingOwner;

    /// @notice Last timestamp where manager fee index was locked.
    uint256 public lastFeeCheckpoint = type(uint256).max;

    /// @notice Fee earned amount for each manager.
    mapping(address => uint256[]) public managersFee;

    /// @notice Total manager fee earned amount.
    uint256[] public managersFeeTotal;

    /// @notice Last timestamp where swap fee was updated.
    uint256 public lastSwapFeeCheckpoint;

    /// EVENTS ///

    /// @notice Emitted when the vault is created.
    /// @param vaultParams Struct vault parameter.
    event Created(NewVaultParams vaultParams);

    /// @notice Emitted when tokens are deposited.
    /// @param requestedAmounts Requested amounts to deposit.
    /// @param amounts Deposited amounts.
    /// @param weights Token weights following deposit.
    event Deposit(
        uint256[] requestedAmounts,
        uint256[] amounts,
        uint256[] weights
    );

    /// @notice Emitted when tokens are withdrawn.
    /// @param requestedAmounts Requested amounts to withdraw.
    /// @param amounts Withdrawn amounts.
    /// @param weights Token weights following withdrawal.
    event Withdraw(
        uint256[] requestedAmounts,
        uint256[] amounts,
        uint256[] weights
    );

    /// @notice Emitted when management fees are withdrawn.
    /// @param manager Manager address.
    /// @param amounts Withdrawn amounts.
    event DistributeManagerFees(address indexed manager, uint256[] amounts);

    /// @notice Emitted when a manager is changed.
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

    /// @notice Emitted when enableTradingWithOraclePrice is called.
    /// @param prices Used oracle prices.
    /// @param weights Updated weights of tokens.
    event UpdateWeightsWithOraclePrice(uint256[] prices, uint256[] weights);

    /// @notice Emitted when cancelWeightUpdates is called.
    /// @param weights Current weights of tokens.
    event CancelWeightUpdates(uint256[] weights);

    /// @notice Emitted when using oracle prices is enabled/disabled.
    /// @param enabled A new state of using oracle prices.
    event SetOraclesEnabled(bool enabled);

    /// @notice Emitted when the swap is enabled/disabled.
    /// @param swapEnabled New state of swap.
    event SetSwapEnabled(bool swapEnabled);

    /// @notice Emitted when enableTradingWithWeights is called.
    /// @param time Timestamp of updates.
    /// @param weights Target weights of tokens.
    event EnabledTradingWithWeights(uint256 time, uint256[] weights);

    /// @notice Emitted when swap fee is updated.
    /// @param swapFee New swap fee.
    event SetSwapFee(uint256 swapFee);

    /// @notice Emitted when the vault is finalized.
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

    error Aera__ValueLengthIsNotSame(uint256 numTokens, uint256 numValues);
    error Aera__DifferentTokensInPosition(
        address actual,
        address sortedToken,
        uint256 index
    );
    error Aera__WrongUnderlyingIndex(
        address yieldToken,
        uint256 underlyingIndex,
        address underlyingAsset,
        address actual
    );
    error Aera__ManagementFeeIsAboveMax(uint256 actual, uint256 max);
    error Aera__MinFeeDurationIsZero();
    error Aera__MinReliableVaultValueIsZero();
    error Aera__MinSignificantDepositValueIsZero();
    error Aera__MaxOracleSpotDivergenceIsZero();
    error Aera__MaxOracleDelayIsZero();
    error Aera__ManagerIsZeroAddress();
    error Aera__ManagerIsOwner(address newManager);
    error Aera__CallerIsNotManager();
    error Aera__SwapFeePercentageChangeIsAboveMax(uint256 actual, uint256 max);
    error Aera__DescriptionIsEmpty();
    error Aera__CallerIsNotOwnerOrManager();
    error Aera__SumOfWeightIsNotOne();
    error Aera__WeightChangeEndBeforeStart();
    error Aera__WeightChangeStartTimeIsAboveMax(uint256 actual, uint256 max);
    error Aera__WeightChangeEndTimeIsAboveMax(uint256 actual, uint256 max);
    error Aera__WeightChangeDurationIsBelowMin(uint256 actual, uint256 min);
    error Aera__WeightChangeRatioIsAboveMax(
        address token,
        uint256 actual,
        uint256 max
    );
    error Aera__WeightIsAboveMax(uint256 actual, uint256 max);
    error Aera__WeightIsBelowMin(uint256 actual, uint256 min);
    error Aera__AmountIsBelowMin(uint256 actual, uint256 min);
    error Aera__AmountExceedAvailable(
        address token,
        uint256 amount,
        uint256 available
    );
    error Aera__OraclePriceIsInvalid(uint256 index, int256 actual);
    error Aera__OracleSpotPriceDivergenceExceedsMax(
        uint256 index,
        uint256 actual,
        uint256 max
    );
    error Aera__OracleIsDelayedBeyondMax(
        uint256 index,
        uint256 actual,
        uint256 max
    );
    error Aera__OraclesAreDisabled();
    error Aera__NoAvailableFeeForCaller(address caller);
    error Aera__BalanceChangedInCurrentBlock();
    error Aera__CannotSweepPoolToken();
    error Aera__PoolSwapIsAlreadyEnabled();
    error Aera__CannotSetSwapFeeBeforeCooldown();
    error Aera__VaultNotInitialized();
    error Aera__VaultIsAlreadyInitialized();
    error Aera__VaultIsFinalized();
    error Aera__VaultIsNotRenounceable();
    error Aera__OwnerIsZeroAddress();
    error Aera__NotPendingOwner();
    error Aera__NoPendingOwnershipTransfer();

    /// MODIFIERS ///

    /// @dev Throws if called by any account other than the manager.
    modifier onlyManager() {
        if (msg.sender != manager) {
            revert Aera__CallerIsNotManager();
        }
        _;
    }

    /// @dev Throws if called by any account other than the owner or manager.
    modifier onlyOwnerOrManager() {
        if (msg.sender != owner() && msg.sender != manager) {
            revert Aera__CallerIsNotOwnerOrManager();
        }
        _;
    }

    /// @dev Throws if called before the vault is initialized.
    modifier whenInitialized() {
        if (!initialized) {
            revert Aera__VaultNotInitialized();
        }
        _;
    }

    /// @dev Throws if called after the vault is finalized.
    modifier whenNotFinalized() {
        if (finalized) {
            revert Aera__VaultIsFinalized();
        }
        _;
    }

    /// FUNCTIONS ///

    /// @notice Initialize the contract by deploying a new Balancer Pool using the provided factory.
    /// @dev Tokens should be unique.
    ///      The following pre-conditions are checked by Balancer in internal transactions:
    ///       If tokens are sorted in ascending order.
    ///       If swapFeePercentage is greater than the minimum and less than the maximum.
    ///       If the total sum of weights is one.
    /// @param vaultParams Struct vault parameter.
    constructor(NewVaultParams memory vaultParams)
        OracleStorage(
            vaultParams.oracles,
            vaultParams.numeraireAssetIndex,
            vaultParams.poolTokens.length
        )
        YieldTokenStorage(vaultParams.yieldTokens)
    {
        numPoolTokens = vaultParams.poolTokens.length;
        numTokens = numPoolTokens + numYieldTokens;

        checkVaultParams(vaultParams);

        address[] memory assetManagers = new address[](numPoolTokens);
        for (uint256 i = 0; i < numPoolTokens; i++) {
            assetManagers[i] = address(this);
        }

        // Deploys a new ManagedPool from ManagedPoolFactory
        // create(
        //     ManagedPool.NewPoolParams memory poolParams,
        //     address owner,
        // )
        //
        // - poolParams.mustAllowlistLPs should be true to prevent other accounts
        //   to use joinPool
        pool = IBManagedPool(
            IBManagedPoolFactory(vaultParams.factory).create(
                IBManagedPoolFactory.NewPoolParams({
                    name: vaultParams.name,
                    symbol: vaultParams.symbol,
                    tokens: vaultParams.poolTokens,
                    normalizedWeights: vaultParams.weights,
                    assetManagers: assetManagers,
                    swapFeePercentage: vaultParams.swapFeePercentage,
                    swapEnabledOnStart: false,
                    mustAllowlistLPs: true,
                    managementAumFeePercentage: 0,
                    aumFeeId: 0
                }),
                address(this)
            )
        );
        pool.addAllowedAddress(address(this));

        // slither-disable-next-line reentrancy-benign
        bVault = pool.getVault();
        merkleOrchard = IBMerkleOrchard(vaultParams.merkleOrchard);
        poolId = pool.getPoolId();
        manager = vaultParams.manager;
        createdAt = block.timestamp;
        minFeeDuration = vaultParams.minFeeDuration;
        minReliableVaultValue = vaultParams.minReliableVaultValue;
        minSignificantDepositValue = vaultParams.minSignificantDepositValue;
        maxOracleSpotDivergence = vaultParams.maxOracleSpotDivergence;
        maxOracleDelay = vaultParams.maxOracleDelay;
        managementFee = vaultParams.managementFee;
        description = vaultParams.description;
        managersFee[manager] = new uint256[](numTokens);
        managersFeeTotal = new uint256[](numTokens);

        // slither-disable-next-line reentrancy-events
        emit Created(vaultParams);
        // slither-disable-next-line reentrancy-events
        emit ManagerChanged(UNSET_MANAGER_ADDRESS, vaultParams.manager);
    }

    /// PROTOCOL API ///

    /// @inheritdoc IProtocolAPI
    function initialDeposit(
        TokenValue[] calldata tokenWithAmount,
        TokenValue[] calldata tokenWithWeight
    ) external override onlyOwner {
        if (initialized) {
            revert Aera__VaultIsAlreadyInitialized();
        }

        initialized = true;
        lastFeeCheckpoint = block.timestamp;

        IERC20[] memory poolTokens = getPoolTokens();
        uint256[] memory amounts = getValuesFromTokenWithValues(
            tokenWithAmount,
            poolTokens
        );
        uint256[] memory targetWeights = getValuesFromTokenWithValues(
            tokenWithWeight,
            poolTokens
        );

        checkWeights(targetWeights);

        uint256[] memory maxAmountsIn = new uint256[](numPoolTokens + 1);
        uint256[] memory balances = new uint256[](numPoolTokens);
        IERC4626[] memory yieldTokens = getYieldTokens();

        maxAmountsIn[0] = type(uint256).max;
        for (uint256 i = 0; i < numPoolTokens; i++) {
            if (amounts[i] > 0) {
                balances[i] = depositToken(poolTokens[i], amounts[i]);
                maxAmountsIn[i + 1] = balances[i];
                setAllowance(poolTokens[i], address(bVault), balances[i]);
            }
        }
        uint256 index = numPoolTokens;
        for (uint256 i = 0; i < numYieldTokens; i++) {
            if (amounts[index] > 0) {
                depositToken(yieldTokens[i], amounts[index]);
            }
            ++index;
        }

        bytes memory initUserData = abi.encode(
            IBVault.JoinKind.INIT,
            balances
        );

        IERC20[] memory tokens;
        (tokens, , ) = bVault.getPoolTokens(poolId);
        IBVault.JoinPoolRequest memory joinPoolRequest = IBVault
            .JoinPoolRequest({
                assets: tokens,
                maxAmountsIn: maxAmountsIn,
                userData: initUserData,
                fromInternalBalance: false
            });
        bVault.joinPool(poolId, address(this), address(this), joinPoolRequest);

        setSwapEnabled(true);
    }

    /// @inheritdoc IProtocolAPI
    function deposit(TokenValue[] calldata tokenWithAmount)
        external
        override
        nonReentrant
        onlyOwner
        whenInitialized
        whenNotFinalized
    {
        depositTokensAndUpdateWeights(tokenWithAmount, PriceType.DETERMINED);
    }

    /// @inheritdoc IProtocolAPI
    // slither-disable-next-line incorrect-equality
    function depositIfBalanceUnchanged(TokenValue[] calldata tokenWithAmount)
        external
        override
        nonReentrant
        onlyOwner
        whenInitialized
        whenNotFinalized
    {
        (, , uint256 lastChangeBlock) = bVault.getPoolTokens(poolId);

        if (lastChangeBlock == block.number) {
            revert Aera__BalanceChangedInCurrentBlock();
        }

        depositTokensAndUpdateWeights(tokenWithAmount, PriceType.DETERMINED);
    }

    /// @inheritdoc IProtocolAPI
    function depositRiskingArbitrage(TokenValue[] calldata tokenWithAmount)
        external
        override
        nonReentrant
        onlyOwner
        whenInitialized
        whenNotFinalized
    {
        depositTokensAndUpdateWeights(tokenWithAmount, PriceType.SPOT);
    }

    /// @inheritdoc IProtocolAPI
    // slither-disable-next-line incorrect-equality
    function depositRiskingArbitrageIfBalanceUnchanged(
        TokenValue[] calldata tokenWithAmount
    )
        external
        override
        nonReentrant
        onlyOwner
        whenInitialized
        whenNotFinalized
    {
        (, , uint256 lastChangeBlock) = bVault.getPoolTokens(poolId);

        if (lastChangeBlock == block.number) {
            revert Aera__BalanceChangedInCurrentBlock();
        }

        depositTokensAndUpdateWeights(tokenWithAmount, PriceType.SPOT);
    }

    /// @inheritdoc IProtocolAPI
    function withdraw(TokenValue[] calldata tokenWithAmount)
        external
        override
        nonReentrant
        onlyOwner
        whenInitialized
        whenNotFinalized
    {
        withdrawTokens(tokenWithAmount);
    }

    /// @inheritdoc IProtocolAPI
    // slither-disable-next-line incorrect-equality
    function withdrawIfBalanceUnchanged(TokenValue[] calldata tokenWithAmount)
        external
        override
        nonReentrant
        onlyOwner
        whenInitialized
        whenNotFinalized
    {
        (, , uint256 lastChangeBlock) = bVault.getPoolTokens(poolId);

        if (lastChangeBlock == block.number) {
            revert Aera__BalanceChangedInCurrentBlock();
        }

        withdrawTokens(tokenWithAmount);
    }

    /// @inheritdoc IProtocolAPI
    function finalize()
        external
        override
        nonReentrant
        onlyOwner
        whenInitialized
        whenNotFinalized
    {
        finalized = true;

        lockManagerFees(true);
        setSwapEnabled(false);

        uint256[] memory amounts = returnFunds();
        emit Finalized(owner(), amounts);
    }

    /// @inheritdoc IProtocolAPI
    function setManager(address newManager)
        external
        override
        nonReentrant
        onlyOwner
    {
        checkManagerAddress(newManager);

        if (initialized && !finalized) {
            lockManagerFees(false);
        }

        if (managersFee[newManager].length == 0) {
            // slither-disable-next-line reentrancy-no-eth
            managersFee[newManager] = new uint256[](numTokens);
        }

        // slither-disable-next-line reentrancy-events
        emit ManagerChanged(manager, newManager);

        // slither-disable-next-line missing-zero-check
        manager = newManager;
    }

    /// @inheritdoc IProtocolAPI
    // prettier-ignore
    function sweep(address token, uint256 amount)
        external
        override
        onlyOwner
    {
        if (token == address(pool)) {
            revert Aera__CannotSweepPoolToken();
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
    function enableTradingWithWeights(TokenValue[] calldata tokenWithWeight)
        external
        override
        onlyOwner
        whenInitialized
    {
        if (pool.getSwapEnabled()) {
            revert Aera__PoolSwapIsAlreadyEnabled();
        }

        IERC20[] memory poolTokens = getPoolTokens();

        uint256[] memory targetWeights = getValuesFromTokenWithValues(
            tokenWithWeight,
            poolTokens
        );

        checkWeights(targetWeights);

        uint256 weightSum = 0;
        uint256[] memory targetPoolWeights = new uint256[](numPoolTokens);

        for (uint256 i = 0; i < numPoolTokens; i++) {
            targetPoolWeights[i] = targetWeights[i];
            weightSum += targetWeights[i];
        }

        targetPoolWeights = normalizeWeights(targetPoolWeights, weightSum);

        pool.updateWeightsGradually(
            block.timestamp,
            block.timestamp,
            poolTokens,
            targetPoolWeights
        );
        pool.setSwapEnabled(true);

        // slither-disable-next-line reentrancy-events
        emit EnabledTradingWithWeights(block.timestamp, targetWeights);
    }

    /// @inheritdoc IProtocolAPI
    // slither-disable-next-line calls-loop
    function enableTradingWithOraclePrice()
        external
        override
        nonReentrant
        onlyManager
        whenInitialized
    {
        (
            uint256[] memory prices,
            uint256[] memory updatedAt
        ) = getOraclePrices();

        checkOracleStatus(updatedAt);

        uint256[] memory poolHoldings = getPoolHoldings();
        uint256[] memory weights = new uint256[](numPoolTokens);
        uint256 weightSum = ONE;
        uint256 holdingsRatio;
        uint256 numeraireAssetHolding = poolHoldings[numeraireAssetIndex];
        weights[numeraireAssetIndex] = ONE;

        for (uint256 i = 0; i < numPoolTokens; i++) {
            if (i == numeraireAssetIndex) {
                continue;
            }

            // slither-disable-next-line divide-before-multiply
            holdingsRatio = (poolHoldings[i] * ONE) / numeraireAssetHolding;
            weights[i] = (holdingsRatio * ONE) / prices[i];
            weightSum += weights[i];
        }

        updatePoolWeights(weights, weightSum);
        setSwapEnabled(true);

        emit UpdateWeightsWithOraclePrice(prices, pool.getNormalizedWeights());
    }

    /// @inheritdoc IProtocolAPI
    function setOraclesEnabled(bool enabled)
        external
        override
        onlyOwnerOrManager
    {
        oraclesEnabled = enabled;

        emit SetOraclesEnabled(enabled);
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

    /// @inheritdoc IProtocolAPI
    // prettier-ignore
    function claimRewards(
        IBMerkleOrchard.Claim[] calldata claims,
        IERC20[] calldata tokens
    )
        external
        override
        onlyOwner
        whenInitialized
    {
        merkleOrchard.claimDistributions(owner(), claims, tokens);
    }

    /// @notice Disable ownership renounceable
    function renounceOwnership() public override onlyOwner {
        revert Aera__VaultIsNotRenounceable();
    }

    /// @inheritdoc IProtocolAPI
    function transferOwnership(address newOwner)
        public
        override(IProtocolAPI, Ownable)
        onlyOwner
    {
        if (newOwner == address(0)) {
            revert Aera__OwnerIsZeroAddress();
        }
        pendingOwner = newOwner;
        emit OwnershipTransferOffered(owner(), newOwner);
    }

    /// @inheritdoc IProtocolAPI
    function cancelOwnershipTransfer() external override onlyOwner {
        if (pendingOwner == address(0)) {
            revert Aera__NoPendingOwnershipTransfer();
        }
        emit OwnershipTransferCanceled(owner(), pendingOwner);
        pendingOwner = address(0);
    }

    /// MANAGER API ///

    /// @inheritdoc IManagerAPI
    function updateWeightsGradually(
        TokenValue[] calldata tokenWithWeight,
        uint256 startTime,
        uint256 endTime
    )
        external
        override
        nonReentrant
        onlyManager
        whenInitialized
        whenNotFinalized
    {
        // These are to protect against the following vulnerability
        // https://forum.balancer.fi/t/vulnerability-disclosure/3179
        if (startTime > type(uint32).max) {
            revert Aera__WeightChangeStartTimeIsAboveMax(
                startTime,
                type(uint32).max
            );
        }
        if (endTime > type(uint32).max) {
            revert Aera__WeightChangeEndTimeIsAboveMax(
                endTime,
                type(uint32).max
            );
        }

        startTime = Math.max(block.timestamp, startTime);
        if (startTime > endTime) {
            revert Aera__WeightChangeEndBeforeStart();
        }
        if (startTime + MINIMUM_WEIGHT_CHANGE_DURATION > endTime) {
            revert Aera__WeightChangeDurationIsBelowMin(
                endTime - startTime,
                MINIMUM_WEIGHT_CHANGE_DURATION
            );
        }

        IERC20[] memory poolTokens;
        uint256[] memory poolHoldings;
        (poolTokens, poolHoldings, ) = getPoolTokensData();
        uint256[] memory targetWeights = getValuesFromTokenWithValues(
            tokenWithWeight,
            poolTokens
        );

        checkWeights(targetWeights);

        uint256[] memory underlyingIndexes = getUnderlyingIndexes();

        adjustYieldTokens(
            poolTokens,
            underlyingIndexes,
            poolHoldings,
            targetWeights
        );

        uint256[] memory targetPoolWeights = adjustPoolWeights(
            underlyingIndexes,
            poolHoldings,
            targetWeights
        );

        checkWeightChangeRatio(
            poolTokens,
            targetPoolWeights,
            startTime,
            endTime
        );

        pool.updateWeightsGradually(
            startTime,
            endTime,
            poolTokens,
            targetPoolWeights
        );

        // slither-disable-next-line reentrancy-events
        emit UpdateWeightsGradually(startTime, endTime, targetWeights);
    }

    /// @inheritdoc IManagerAPI
    function cancelWeightUpdates()
        external
        override
        nonReentrant
        onlyManager
        whenInitialized
        whenNotFinalized
    {
        uint256[] memory weights = pool.getNormalizedWeights();
        uint256 weightSum = 0;

        for (uint256 i = 0; i < numPoolTokens; i++) {
            weightSum += weights[i];
        }

        updatePoolWeights(weights, weightSum);

        // slither-disable-next-line reentrancy-events
        emit CancelWeightUpdates(getNormalizedWeights());
    }

    /// @inheritdoc IManagerAPI
    function setSwapFee(uint256 newSwapFee)
        external
        override
        nonReentrant
        onlyManager
    {
        if (
            block.timestamp < lastSwapFeeCheckpoint + SWAP_FEE_COOLDOWN_PERIOD
        ) {
            revert Aera__CannotSetSwapFeeBeforeCooldown();
        }
        lastSwapFeeCheckpoint = block.timestamp;

        uint256 oldSwapFee = pool.getSwapFeePercentage();

        uint256 absoluteDelta = (newSwapFee > oldSwapFee)
            ? newSwapFee - oldSwapFee
            : oldSwapFee - newSwapFee;
        if (absoluteDelta > MAXIMUM_SWAP_FEE_PERCENT_CHANGE) {
            revert Aera__SwapFeePercentageChangeIsAboveMax(
                absoluteDelta,
                MAXIMUM_SWAP_FEE_PERCENT_CHANGE
            );
        }

        pool.updateSwapFeeGradually(
            block.timestamp,
            block.timestamp,
            newSwapFee,
            newSwapFee
        );
        // slither-disable-next-line reentrancy-events
        emit SetSwapFee(newSwapFee);
    }

    /// @inheritdoc IManagerAPI
    function claimManagerFees()
        external
        override
        nonReentrant
        whenInitialized
        whenNotFinalized
    {
        if (msg.sender == manager) {
            lockManagerFees(false);
        }

        if (managersFee[msg.sender].length == 0) {
            revert Aera__NoAvailableFeeForCaller(msg.sender);
        }

        IERC20[] memory tokens = getTokens();

        uint256[] memory fees = managersFee[msg.sender];

        for (uint256 i = 0; i < numTokens; i++) {
            // slither-disable-next-line reentrancy-no-eth
            managersFeeTotal[i] -= fees[i];
            managersFee[msg.sender][i] = 0;
            tokens[i].safeTransfer(msg.sender, fees[i]);
        }

        // slither-disable-next-line reentrancy-no-eth
        if (msg.sender != manager) {
            delete managersFee[msg.sender];
        }

        // slither-disable-next-line reentrancy-events
        emit DistributeManagerFees(msg.sender, fees);
    }

    /// MULTI ASSET VAULT INTERFACE ///

    /// @inheritdoc IMultiAssetVault
    // prettier-ignore
    function holding(uint256 index)
        external
        view
        override
        returns (uint256)
    {
        uint256[] memory poolHoldings = getHoldings();
        return poolHoldings[index];
    }

    /// @inheritdoc IMultiAssetVault
    function getHoldings()
        public
        view
        override
        returns (uint256[] memory holdings)
    {
        uint256[] memory poolHoldings = getPoolHoldings();
        IERC4626[] memory yieldTokens = getYieldTokens();
        holdings = new uint256[](numTokens);

        for (uint256 i = 0; i < numPoolTokens; i++) {
            holdings[i] = poolHoldings[i];
        }

        uint256 index = numPoolTokens;
        for (uint256 i = 0; i < numYieldTokens; i++) {
            // slither-disable-next-line calls-loop
            holdings[index] =
                yieldTokens[i].balanceOf(address(this)) -
                managersFeeTotal[index];
            ++index;
        }
    }

    /// USER API ///

    /// @inheritdoc IUserAPI
    // prettier-ignore
    function isSwapEnabled()
        external
        view
        override
        returns (bool)
    {
        return pool.getSwapEnabled();
    }

    /// @inheritdoc IUserAPI
    // prettier-ignore
    function getSwapFee()
        external
        view
        override
        returns (uint256)
    {
        return pool.getSwapFeePercentage();
    }

    /// @inheritdoc IUserAPI
    function getNormalizedWeights()
        public
        view
        returns (uint256[] memory weights)
    {
        uint256[] memory poolHoldings = getPoolHoldings();
        uint256[] memory underlyingIndexes = getUnderlyingIndexes();
        uint256[] memory underlyingBalances = getUnderlyingBalances();
        (uint256[] memory oraclePrices, ) = getOraclePrices();

        uint256 value = getValue(
            getUnderlyingTotalBalances(
                underlyingIndexes,
                poolHoldings,
                underlyingBalances
            ),
            oraclePrices
        );

        weights = calcNormalizedWeights(
            value,
            oraclePrices,
            underlyingIndexes,
            underlyingBalances
        );
    }

    /// @inheritdoc IUserAPI
    function getTokensData()
        public
        view
        override
        returns (
            IERC20[] memory tokens,
            uint256[] memory holdings,
            uint256 lastChangeBlock
        )
    {
        IERC20[] memory poolTokens;
        uint256[] memory poolHoldings;
        (poolTokens, poolHoldings, lastChangeBlock) = getPoolTokensData();

        IERC4626[] memory yieldTokens = getYieldTokens();
        tokens = new IERC20[](numTokens);
        holdings = new uint256[](numTokens);

        for (uint256 i = 0; i < numPoolTokens; i++) {
            tokens[i] = poolTokens[i];
            holdings[i] = poolHoldings[i];
        }

        uint256 index = numPoolTokens;
        for (uint256 i = 0; i < numYieldTokens; i++) {
            tokens[index] = yieldTokens[i];
            // slither-disable-next-line calls-loop
            holdings[index] =
                yieldTokens[i].balanceOf(address(this)) -
                managersFeeTotal[index];
            ++index;
        }
    }

    /// @inheritdoc IUserAPI
    function getTokens()
        public
        view
        override
        returns (IERC20[] memory tokens)
    {
        IERC20[] memory poolTokens = getPoolTokens();
        IERC4626[] memory yieldTokens = getYieldTokens();
        tokens = new IERC20[](numTokens);

        for (uint256 i = 0; i < numPoolTokens; i++) {
            tokens[i] = poolTokens[i];
        }

        uint256 index = numPoolTokens;
        for (uint256 i = 0; i < numYieldTokens; i++) {
            tokens[index] = yieldTokens[i];
            ++index;
        }
    }

    /// @inheritdoc IUserAPI
    function acceptOwnership() external override {
        if (msg.sender != pendingOwner) {
            revert Aera__NotPendingOwner();
        }
        _transferOwnership(pendingOwner);
        pendingOwner = address(0);
    }

    /// INTERNAL FUNCTIONS ///

    /// @notice Deposit amounts of tokens and update weights.
    /// @dev Will only be called by deposit(), depositIfBalanceUnchanged(),
    ///      depositRiskingArbitrage() and depositRiskingArbitrageIfBalanceUnchanged().
    ///      It calls updatePoolWeights() function which cancels
    ///      current active weights change schedule.
    /// @param tokenWithAmount Deposit tokens with amounts.
    /// @param priceType Price type to be used.
    function depositTokensAndUpdateWeights(
        TokenValue[] calldata tokenWithAmount,
        PriceType priceType
    ) internal {
        lockManagerFees(false);

        IERC20[] memory poolTokens;
        uint256[] memory poolHoldings;
        (poolTokens, poolHoldings, ) = getPoolTokensData();
        uint256[] memory weights = pool.getNormalizedWeights();

        uint256[] memory amounts = getValuesFromTokenWithValues(
            tokenWithAmount,
            poolTokens
        );

        uint256[] memory determinedPrices;
        if (priceType == PriceType.DETERMINED) {
            (determinedPrices, priceType) = getDeterminedPrices(amounts);
        }

        uint256[] memory newBalances = depositTokens(amounts);

        uint256[] memory poolNewHoldings = getPoolHoldings();
        uint256 weightSum = 0;

        if (priceType == PriceType.ORACLE) {
            uint256 numeraireAssetHolding = poolNewHoldings[
                numeraireAssetIndex
            ];
            weights[numeraireAssetIndex] = ONE;
            for (uint256 i = 0; i < numPoolTokens; i++) {
                if (i != numeraireAssetIndex) {
                    weights[i] =
                        (poolNewHoldings[i] * determinedPrices[i]) /
                        numeraireAssetHolding;
                }
                if (amounts[i] > 0) {
                    newBalances[i] = poolNewHoldings[i] - poolHoldings[i];
                }

                weightSum += weights[i];
            }
        } else {
            for (uint256 i = 0; i < numPoolTokens; i++) {
                if (amounts[i] > 0) {
                    weights[i] =
                        (weights[i] * poolNewHoldings[i]) /
                        poolHoldings[i];
                    newBalances[i] = poolNewHoldings[i] - poolHoldings[i];
                }

                weightSum += weights[i];
            }
        }

        /// It cancels the current active weights change schedule
        /// and update weights with newWeights
        updatePoolWeights(weights, weightSum);

        // slither-disable-next-line reentrancy-events
        emit Deposit(amounts, newBalances, getNormalizedWeights());
    }

    /// @notice Deposit amounts of tokens.
    /// @dev Will only be called by depositTokensAndUpdateWeights().
    /// @param amounts Deposit token amounts.
    /// @return depositedAmounts Actual deposited amounts excluding fee on transfer.
    function depositTokens(uint256[] memory amounts)
        internal
        returns (uint256[] memory depositedAmounts)
    {
        IERC20[] memory tokens = getTokens();
        depositedAmounts = new uint256[](numTokens);

        for (uint256 i = 0; i < numTokens; i++) {
            if (amounts[i] > 0) {
                depositedAmounts[i] = depositToken(tokens[i], amounts[i]);

                if (i < numPoolTokens) {
                    setAllowance(
                        tokens[i],
                        address(bVault),
                        depositedAmounts[i]
                    );
                }
            }
        }

        depositToPool(getPoolTokenValues(depositedAmounts));
    }

    /// @notice Withdraw tokens from Aera Vault to Balancer Pool.
    /// @dev Will only be called by depositTokens() and depositToYieldTokens().
    /// @param amounts The amounts of tokens to deposit.
    function depositToPool(uint256[] memory amounts) internal {
        /// Set managed balance of pool as amounts
        /// i.e. Deposit amounts of tokens to pool from Aera Vault
        updatePoolBalance(amounts, IBVault.PoolBalanceOpKind.UPDATE);
        /// Decrease managed balance and increase cash balance of the pool
        /// i.e. Move amounts from managed balance to cash balance
        updatePoolBalance(amounts, IBVault.PoolBalanceOpKind.DEPOSIT);
    }

    /// @notice Withdraw tokens up to requested amounts.
    /// @dev Will only be called by withdraw() and withdrawIfBalanceUnchanged().
    ///      It calls updatePoolWeights() function which cancels
    ///      current active weights change schedule.
    /// @param tokenWithAmount Requested tokens with amounts.
    function withdrawTokens(TokenValue[] calldata tokenWithAmount) internal {
        lockManagerFees(false);

        IERC20[] memory poolTokens = getPoolTokens();
        IERC4626[] memory yieldTokens = getYieldTokens();
        uint256[] memory holdings = getHoldings();
        uint256[] memory weights = pool.getNormalizedWeights();
        uint256[] memory amounts = getValuesFromTokenWithValues(
            tokenWithAmount,
            poolTokens
        );

        checkWithdrawAmount(poolTokens, yieldTokens, holdings, amounts);

        uint256[] memory balances = new uint256[](numTokens);
        for (uint256 i = 0; i < numPoolTokens; i++) {
            if (amounts[i] > 0) {
                balances[i] = poolTokens[i].balanceOf(address(this));
            }
        }

        withdrawFromPool(getPoolTokenValues(amounts));

        uint256 weightSum = 0;
        for (uint256 i = 0; i < numPoolTokens; i++) {
            if (amounts[i] > 0) {
                balances[i] =
                    poolTokens[i].balanceOf(address(this)) -
                    balances[i];
                poolTokens[i].safeTransfer(owner(), balances[i]);

                weights[i] =
                    (weights[i] * (holdings[i] - amounts[i])) /
                    holdings[i];
            }

            weightSum += weights[i];
        }

        bool[] memory isWithdrawable = getWithdrawables();
        uint256[] memory underlyingIndexes = getUnderlyingIndexes();
        IERC20 underlyingAsset;
        uint256 index = numPoolTokens;

        for (uint256 i = 0; i < numYieldTokens; i++) {
            if (amounts[index] > 0) {
                if (isWithdrawable[i]) {
                    balances[index] = amounts[index];
                    yieldTokens[i].safeTransfer(owner(), balances[index]);
                } else {
                    underlyingAsset = poolTokens[underlyingIndexes[i]];
                    balances[index] = withdrawUnderlyingAsset(
                        yieldTokens[i],
                        underlyingAsset,
                        amounts[index]
                    );
                    underlyingAsset.safeTransfer(owner(), balances[index]);
                }
            }
            ++index;
        }

        /// It cancels the current active weights change schedule
        /// and update weights with newWeights
        updatePoolWeights(weights, weightSum);

        // slither-disable-next-line reentrancy-events
        emit Withdraw(amounts, balances, getNormalizedWeights());
    }

    /// @notice Withdraw tokens from Balancer Pool to Aera Vault.
    /// @dev Will only be called by withdrawTokens(), returnFunds(),
    ///      withdrawNecessaryTokensFromPool() and lockManagerFees().
    /// @param amounts The amounts of tokens to withdraw.
    function withdrawFromPool(uint256[] memory amounts) internal {
        uint256[] memory managed = new uint256[](numPoolTokens);

        /// Decrease cash balance and increase managed balance of the pool
        /// i.e. Move amounts from cash balance to managed balance
        /// and withdraw token amounts from the pool to Aera Vault
        updatePoolBalance(amounts, IBVault.PoolBalanceOpKind.WITHDRAW);
        /// Adjust managed balance of the pool as the zero array
        updatePoolBalance(managed, IBVault.PoolBalanceOpKind.UPDATE);
    }

    /// @notice Calculate manager fees and lock the tokens in Vault.
    /// @dev Will only be called by claimManagerFees(), setManager(),
    ///      finalize(), depositTokensAndUpdateWeights(),
    ///      and withdrawTokens().
    /// @param lockGuaranteedFee True if the guaranteed fee should be locked.
    function lockManagerFees(bool lockGuaranteedFee) internal {
        if (managementFee == 0) {
            return;
        }

        uint256 feeIndex = getFeeIndex(lockGuaranteedFee);

        // slither-disable-next-line incorrect-equality
        if (feeIndex == 0) {
            return;
        }

        IERC20[] memory poolTokens = getPoolTokens();
        uint256[] memory holdings = getHoldings();

        uint256[] memory newFees = new uint256[](numPoolTokens);
        uint256[] memory balances = new uint256[](numPoolTokens);

        for (uint256 i = 0; i < numPoolTokens; i++) {
            balances[i] = poolTokens[i].balanceOf(address(this));
            newFees[i] = (holdings[i] * feeIndex * managementFee) / ONE;
        }

        lastFeeCheckpoint = block.timestamp;

        withdrawFromPool(newFees);

        for (uint256 i = 0; i < numPoolTokens; i++) {
            newFees[i] = poolTokens[i].balanceOf(address(this)) - balances[i];
            // slither-disable-next-line reentrancy-benign
            managersFee[manager][i] += newFees[i];
            // slither-disable-next-line reentrancy-no-eth
            managersFeeTotal[i] += newFees[i];
        }

        uint256 newFee;
        for (uint256 i = numPoolTokens; i < numTokens; i++) {
            newFee = (holdings[i] * feeIndex * managementFee) / ONE;
            // slither-disable-next-line reentrancy-benign
            managersFee[manager][i] += newFee;
            // slither-disable-next-line reentrancy-no-eth
            managersFeeTotal[i] += newFee;
        }
    }

    /// @notice Calculate manager fee index.
    /// @dev Will only be called by lockManagerFees().
    /// @param lockGuaranteedFee True if the guaranteed fee should be locked.
    function getFeeIndex(bool lockGuaranteedFee)
        internal
        view
        returns (uint256)
    {
        uint256 feeIndex = 0;

        if (block.timestamp > lastFeeCheckpoint) {
            feeIndex = block.timestamp - lastFeeCheckpoint;
        }

        if (lockGuaranteedFee) {
            uint256 minFeeCheckpoint = createdAt + minFeeDuration;

            if (minFeeCheckpoint > block.timestamp) {
                feeIndex += (minFeeCheckpoint - block.timestamp);
            }
        }

        return feeIndex;
    }

    /// @notice Calculate a change ratio for weight upgrade.
    /// @dev Will only be called by checkWeightChangeRatio().
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

    /// @notice Return an array of values from the given tokenWithValues.
    /// @dev Will only be called by initialDeposit(), enableTradingWithWeights(),
    ///      depositTokensAndUpdateWeights(), withdrawTokens()
    ///      and updateWeightsGradually()
    ///      The values could be amounts or weights.
    /// @param tokenWithValues Tokens with values.
    /// @param poolTokens Array of pool tokens.
    /// @return Array of values.
    function getValuesFromTokenWithValues(
        TokenValue[] calldata tokenWithValues,
        IERC20[] memory poolTokens
    ) internal view returns (uint256[] memory) {
        if (numTokens != tokenWithValues.length) {
            revert Aera__ValueLengthIsNotSame(
                numTokens,
                tokenWithValues.length
            );
        }

        uint256[] memory values = new uint256[](numTokens);
        for (uint256 i = 0; i < numPoolTokens; i++) {
            if (tokenWithValues[i].token != address(poolTokens[i])) {
                revert Aera__DifferentTokensInPosition(
                    tokenWithValues[i].token,
                    address(poolTokens[i]),
                    i
                );
            }
            values[i] = tokenWithValues[i].value;
        }

        IERC4626[] memory yieldTokens = getYieldTokens();
        uint256 index = numPoolTokens;
        for (uint256 i = 0; i < numYieldTokens; i++) {
            if (tokenWithValues[index].token != address(yieldTokens[i])) {
                revert Aera__DifferentTokensInPosition(
                    tokenWithValues[index].token,
                    address(yieldTokens[i]),
                    index
                );
            }
            values[index] = tokenWithValues[index].value;
            ++index;
        }

        return values;
    }

    /// @notice Return an array of values for pool tokens from given values.
    /// @dev Will only be called by depositTokens() and withdrawTokens().
    /// @param values Array of values for pool tokens and yield tokens.
    /// @return poolTokenValues Array of values for pool tokens.
    function getPoolTokenValues(uint256[] memory values)
        internal
        view
        returns (uint256[] memory poolTokenValues)
    {
        poolTokenValues = new uint256[](numPoolTokens);

        for (uint256 i = 0; i < numPoolTokens; i++) {
            poolTokenValues[i] = values[i];
        }
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
        IBVault.PoolBalanceOp[] memory ops = new IBVault.PoolBalanceOp[](
            numPoolTokens
        );
        IERC20[] memory poolTokens = getPoolTokens();

        bytes32 balancerPoolId = poolId;
        for (uint256 i = 0; i < numPoolTokens; i++) {
            ops[i].kind = kind;
            ops[i].poolId = balancerPoolId;
            ops[i].token = poolTokens[i];
            ops[i].amount = amounts[i];
        }

        bVault.managePoolBalance(ops);
    }

    /// @notice Update weights of tokens in the pool.
    /// @dev Will only be called by depositTokensAndUpdateWeights(),
    ///      withdrawTokens(), enableTradingWithOraclePrice()
    ///      and cancelWeightUpdates().
    /// @param weights Array of weights.
    /// @param weightSum Current sum of weights.
    function updatePoolWeights(uint256[] memory weights, uint256 weightSum)
        internal
    {
        uint256[] memory newWeights = normalizeWeights(weights, weightSum);
        IERC20[] memory poolTokens = getPoolTokens();

        pool.updateWeightsGradually(
            block.timestamp,
            block.timestamp,
            poolTokens,
            newWeights
        );
    }

    /// @notice Normalize weights to make a sum of weights one.
    /// @dev Will only be called by enableTradingWithWeights() and updateWeightsGradually().
    /// @param weights Array of weights to be normalized.
    /// @param weightSum Current sum of weights.
    /// @return newWeights Array of normalized weights.
    function normalizeWeights(uint256[] memory weights, uint256 weightSum)
        internal
        pure
        returns (uint256[] memory newWeights)
    {
        uint256 numWeights = weights.length;
        newWeights = new uint256[](numWeights);

        uint256 adjustedSum;
        for (uint256 i = 0; i < numWeights; i++) {
            newWeights[i] = (weights[i] * ONE) / weightSum;
            adjustedSum += newWeights[i];
        }

        newWeights[0] = newWeights[0] + ONE - adjustedSum;
    }

    /// @notice Deposit token to the pool.
    /// @dev Will only be called by initialDeposit() and depositTokens().
    /// @param token Address of the token to deposit.
    /// @param amount Amount to deposit.
    /// @return Actual deposited amount excluding fee on transfer.
    function depositToken(IERC20 token, uint256 amount)
        internal
        returns (uint256)
    {
        // slither-disable-next-line calls-loop
        uint256 balance = token.balanceOf(address(this));
        token.safeTransferFrom(owner(), address(this), amount);
        // slither-disable-next-line calls-loop
        balance = token.balanceOf(address(this)) - balance;

        return balance;
    }

    /// @notice Set allowance of token for a spender.
    /// @dev Will only be called by initialDeposit(), depositTokens(),
    ///      depositToYieldTokens() and depositUnderlyingAsset().
    /// @param token Token of address to set allowance.
    /// @param spender Address to give spend approval to.
    /// @param amount Amount to approve for spending.
    function setAllowance(
        IERC20 token,
        address spender,
        uint256 amount
    ) internal {
        clearAllowance(token, spender);
        token.safeIncreaseAllowance(spender, amount);
    }

    /// @notice Reset allowance of token for a spender.
    /// @dev Will only be called by setAllowance() and depositUnderlyingAsset().
    /// @param token Token of address to set allowance.
    /// @param spender Address to give spend approval to.
    function clearAllowance(IERC20 token, address spender) internal {
        // slither-disable-next-line calls-loop
        uint256 allowance = token.allowance(address(this), spender);
        if (allowance > 0) {
            token.safeDecreaseAllowance(spender, allowance);
        }
    }

    /// @notice Return all funds to the owner.
    /// @dev Will only be called by finalize().
    /// @return amounts Exact returned amounts of tokens.
    function returnFunds() internal returns (uint256[] memory amounts) {
        IERC20[] memory tokens = getTokens();
        uint256[] memory poolHoldings = getPoolHoldings();

        amounts = new uint256[](numTokens);

        withdrawFromPool(poolHoldings);

        uint256 amount;
        IERC20 token;
        for (uint256 i = 0; i < numTokens; i++) {
            token = tokens[i];
            amount = token.balanceOf(address(this)) - managersFeeTotal[i];
            token.safeTransfer(owner(), amount);
            amounts[i] = amount;
        }
    }

    /// @notice Get Token Data of Balancer Pool.
    /// @return poolTokens IERC20 tokens of Balancer Pool.
    /// @return poolHoldings Balances of tokens of Balancer Pool.
    /// @return lastChangeBlock Last updated Blocknumber.
    function getPoolTokensData()
        internal
        view
        returns (
            IERC20[] memory poolTokens,
            uint256[] memory poolHoldings,
            uint256 lastChangeBlock
        )
    {
        poolTokens = new IERC20[](numPoolTokens);
        poolHoldings = new uint256[](numPoolTokens);

        IERC20[] memory tokens;
        uint256[] memory holdings;
        (tokens, holdings, lastChangeBlock) = bVault.getPoolTokens(poolId);
        for (uint256 i = 0; i < numPoolTokens; i++) {
            poolTokens[i] = tokens[i + 1];
            poolHoldings[i] = holdings[i + 1];
        }
    }

    /// @notice Get IERC20 Tokens of Balancer Pool.
    /// @return poolTokens IERC20 tokens of Balancer Pool.
    function getPoolTokens()
        internal
        view
        returns (IERC20[] memory poolTokens)
    {
        poolTokens = new IERC20[](numPoolTokens);

        IERC20[] memory tokens;
        (tokens, , ) = bVault.getPoolTokens(poolId);
        for (uint256 i = 0; i < numPoolTokens; i++) {
            poolTokens[i] = tokens[i + 1];
        }
    }

    /// @notice Get balances of tokens of Balancer Pool.
    /// @return poolHoldings Balances of tokens in Balancer Pool.
    function getPoolHoldings()
        internal
        view
        returns (uint256[] memory poolHoldings)
    {
        poolHoldings = new uint256[](numPoolTokens);

        uint256[] memory holdings;
        (, holdings, ) = bVault.getPoolTokens(poolId);
        for (uint256 i = 0; i < numPoolTokens; i++) {
            poolHoldings[i] = holdings[i + 1];
        }
    }

    /// @notice Determine best prices for deposits.
    /// @dev Will only be called by depositTokensAndUpdateWeights().
    /// @param amounts Deposit token amounts.
    /// @return prices Determined token prices.
    /// @return priceType Determined price type.
    function getDeterminedPrices(uint256[] memory amounts)
        internal
        view
        returns (uint256[] memory prices, PriceType priceType)
    {
        uint256[] memory poolHoldings = getPoolHoldings();
        (
            uint256[] memory oraclePrices,
            uint256[] memory updatedAt
        ) = getOraclePrices();
        uint256[] memory spotPrices = getSpotPrices(poolHoldings);
        uint256[] memory underlyingIndexes = getUnderlyingIndexes();
        uint256[] memory underlyingTotalBalances = getUnderlyingTotalBalances(
            underlyingIndexes,
            poolHoldings,
            getUnderlyingBalances()
        );

        if (
            getValue(underlyingTotalBalances, spotPrices) <
            minReliableVaultValue
        ) {
            checkOracleStatus(updatedAt);
            return (oraclePrices, PriceType.ORACLE);
        }

        uint256 ratio;
        for (uint256 i = 0; i < numPoolTokens; i++) {
            if (i == numeraireAssetIndex) {
                continue;
            }

            // Oracle prices are not zero since we check it while get it
            // in getOraclePrices()
            ratio = oraclePrices[i] > spotPrices[i]
                ? (oraclePrices[i] * ONE) / spotPrices[i]
                : (spotPrices[i] * ONE) / oraclePrices[i];
            if (ratio > maxOracleSpotDivergence) {
                revert Aera__OracleSpotPriceDivergenceExceedsMax(
                    i,
                    ratio,
                    maxOracleSpotDivergence
                );
            }
        }

        if (getValue(amounts, spotPrices) < minSignificantDepositValue) {
            return (spotPrices, PriceType.SPOT);
        }

        checkOracleStatus(updatedAt);
        return (oraclePrices, PriceType.ORACLE);
    }

    /// @notice Calculate the value of token amounts in the base token terms.
    /// @dev Will only be called by getDeterminedPrices().
    /// @param amounts Token amounts.
    /// @param prices Token prices in the base token terms.
    /// @return Total value in the base token terms.
    function getValue(uint256[] memory amounts, uint256[] memory prices)
        internal
        view
        returns (uint256)
    {
        uint256 value = 0;

        for (uint256 i = 0; i < prices.length; i++) {
            if (i == numeraireAssetIndex) {
                value += amounts[i];
                continue;
            }

            value += ((amounts[i] * prices[i]) / ONE);
        }

        return value;
    }

    /// @notice Calculate spot prices of tokens vs the base token.
    /// @dev Will only be called by getDeterminedPrices().
    /// @param poolHoldings Balances of tokens in Balancer Pool.
    /// @return Spot prices of tokens vs base token.
    function getSpotPrices(uint256[] memory poolHoldings)
        internal
        view
        returns (uint256[] memory)
    {
        uint256[] memory weights = pool.getNormalizedWeights();
        uint256[] memory prices = new uint256[](numPoolTokens);
        uint256 swapFee = pool.getSwapFeePercentage();
        uint256 numeraireAssetHolding = poolHoldings[numeraireAssetIndex];
        uint256 numeraireAssetWeight = weights[numeraireAssetIndex];

        for (uint256 i = 0; i < numPoolTokens; i++) {
            if (i == numeraireAssetIndex) {
                prices[i] = ONE;
                continue;
            }
            prices[i] = calcSpotPrice(
                numeraireAssetHolding,
                numeraireAssetWeight,
                poolHoldings[i],
                weights[i],
                swapFee
            );
        }

        return prices;
    }

    /// @notice Calculate spot price from balances and weights.
    /// @dev Will only be called by getSpotPrices().
    /// @return Spot price from balances and weights.
    // slither-disable-next-line divide-before-multiply
    function calcSpotPrice(
        uint256 tokenBalanceIn,
        uint256 tokenWeightIn,
        uint256 tokenBalanceOut,
        uint256 tokenWeightOut,
        uint256 swapFee
    ) internal pure returns (uint256) {
        uint256 numer = (tokenBalanceIn * ONE) / tokenWeightIn;
        uint256 denom = (tokenBalanceOut * ONE) / tokenWeightOut;
        uint256 ratio = (numer * ONE) / denom;
        uint256 scale = (ONE * ONE) / (ONE - swapFee);
        return (ratio * scale) / ONE;
    }

    /// @notice Adjust the balance of underlying assets in yield tokens.
    /// @dev Will only be called by updateWeightsGradually().
    /// @param poolTokens Array of pool tokens.
    /// @param underlyingIndexes Array of underlying indexes.
    /// @param poolHoldings Balances of tokens in Balancer Pool.
    /// @param targetWeights Target weights of tokens in Vault.
    function adjustYieldTokens(
        IERC20[] memory poolTokens,
        uint256[] memory underlyingIndexes,
        uint256[] memory poolHoldings,
        uint256[] memory targetWeights
    ) internal {
        uint256[] memory underlyingBalances = getUnderlyingBalances();
        IERC4626[] memory yieldTokens = getYieldTokens();

        (
            uint256[] memory depositAmounts,
            uint256[] memory withdrawAmounts
        ) = calcAdjustmentAmounts(
                underlyingIndexes,
                poolHoldings,
                underlyingBalances,
                targetWeights
            );

        uint256[] memory balances = withdrawFromYieldTokens(
            poolTokens,
            yieldTokens,
            underlyingIndexes,
            withdrawAmounts
        );

        depositToYieldTokens(
            poolTokens,
            yieldTokens,
            underlyingIndexes,
            poolHoldings,
            depositAmounts,
            balances
        );
    }

    /// @notice Adjust the weights of tokens in the Balancer Pool.
    /// @dev Will only be called by updateWeightsGradually().
    /// @param underlyingIndexes Array of underlying indexes.
    /// @param poolHoldings Balances of tokens in Balancer Pool.
    /// @param targetWeights Target weights of tokens in Vault.
    /// @return targetPoolWeights Target weights of pool tokens should be scheduled.
    function adjustPoolWeights(
        uint256[] memory underlyingIndexes,
        uint256[] memory poolHoldings,
        uint256[] memory targetWeights
    ) internal returns (uint256[] memory targetPoolWeights) {
        uint256[] memory newPoolWeights = new uint256[](numPoolTokens);
        targetPoolWeights = getUnderlyingTotalWeights(
            underlyingIndexes,
            targetWeights
        );
        uint256[] memory currentPoolHoldings = getPoolHoldings();
        uint256[] memory poolWeights = pool.getNormalizedWeights();
        uint256[] memory currentWeights = getNormalizedWeights();

        uint256 index = numPoolTokens;
        for (uint256 i = 0; i < numYieldTokens; i++) {
            targetPoolWeights[underlyingIndexes[i]] -= currentWeights[index];
            ++index;
        }

        uint256 weightSum = 0;
        uint256 targetWeightSum = 0;
        for (uint256 i = 0; i < numPoolTokens; i++) {
            newPoolWeights[i] =
                (poolWeights[i] * currentPoolHoldings[i]) /
                poolHoldings[i];
            weightSum += newPoolWeights[i];
            targetWeightSum += targetPoolWeights[i];
        }

        updatePoolWeights(newPoolWeights, weightSum);

        targetPoolWeights = normalizeWeights(
            targetPoolWeights,
            targetWeightSum
        );
    }

    /// @notice Get the total weights of pool tokens in Vault.
    /// @dev Will only be called by adjustPoolWeights().
    /// @param underlyingIndexes Array of underlying indexes.
    /// @param weights Weights of tokens in Vault.
    /// @return underlyingTotalWeights Total weights of pool tokens.
    function getUnderlyingTotalWeights(
        uint256[] memory underlyingIndexes,
        uint256[] memory weights
    ) internal view returns (uint256[] memory underlyingTotalWeights) {
        underlyingTotalWeights = new uint256[](numPoolTokens);

        for (uint256 i = 0; i < numPoolTokens; i++) {
            underlyingTotalWeights[i] = weights[i];
        }
        uint256 index = numPoolTokens;
        for (uint256 i = 0; i < numYieldTokens; i++) {
            underlyingTotalWeights[underlyingIndexes[i]] += weights[index];
            ++index;
        }

        return underlyingTotalWeights;
    }

    /// @notice Get the balance of underlying assets in yield tokens.
    /// @dev Will only be called by updateWeightsGradually(), getNormalizedWeights()
    ///      and getDeterminedPrices().
    /// @return underlyingBalances Total balance of underlying assets in yield tokens.
    function getUnderlyingBalances()
        internal
        view
        returns (uint256[] memory underlyingBalances)
    {
        underlyingBalances = new uint256[](numYieldTokens);
        IERC4626[] memory yieldTokens = getYieldTokens();

        uint256 index = numPoolTokens;
        for (uint256 i = 0; i < numYieldTokens; i++) {
            underlyingBalances[i] = yieldTokens[i].convertToAssets(
                yieldTokens[i].balanceOf(address(this)) -
                    managersFeeTotal[index]
            );
            ++index;
        }

        return underlyingBalances;
    }

    /// @notice Get the total balance of pool tokens in Vault.
    /// @dev Will only be called by getNormalizedWeights(), getDeterminedPrices()
    ///      and calcAdjustmentAmounts().
    /// @param underlyingIndexes Array of underlying indexes.
    /// @param poolHoldings Balances of tokens in Balancer Pool.
    /// @param underlyingBalances Total balance of underlying assets in yield tokens.
    /// @return underlyingTotalBalances Total balance of pool tokens.
    function getUnderlyingTotalBalances(
        uint256[] memory underlyingIndexes,
        uint256[] memory poolHoldings,
        uint256[] memory underlyingBalances
    ) internal view returns (uint256[] memory underlyingTotalBalances) {
        underlyingTotalBalances = new uint256[](numPoolTokens);

        for (uint256 i = 0; i < numPoolTokens; i++) {
            underlyingTotalBalances[i] = poolHoldings[i];
        }

        for (uint256 i = 0; i < numYieldTokens; i++) {
            if (underlyingBalances[i] > 0) {
                underlyingTotalBalances[
                    underlyingIndexes[i]
                ] += underlyingBalances[i];
            }
        }

        return underlyingTotalBalances;
    }

    /// @notice Calculate the normalized weights of tokens in Vault.
    /// @dev Will only be called by getNormalizedWeights().
    /// @param value Total value in the base token term.
    /// @param oraclePrices Array of oracle prices.
    /// @param underlyingIndexes Array of underlying indexes.
    /// @param underlyingBalances Total balance of underlying assets in yield tokens.
    /// @return weights Normalized weights of tokens in Vault.
    function calcNormalizedWeights(
        uint256 value,
        uint256[] memory oraclePrices,
        uint256[] memory underlyingIndexes,
        uint256[] memory underlyingBalances
    ) internal view returns (uint256[] memory weights) {
        weights = new uint256[](numTokens);
        uint256[] memory poolWeights = pool.getNormalizedWeights();
        uint256 poolWeightSum = ONE;

        uint256 weight = 0;
        uint256 weightSum = 0;
        uint256 index = numPoolTokens;
        for (uint256 i = 0; i < numYieldTokens; i++) {
            weight =
                (underlyingBalances[i] * oraclePrices[underlyingIndexes[i]]) /
                value;
            weights[index] = weight;
            poolWeightSum -= weight;
            weightSum += weight;
            ++index;
        }

        for (uint256 i = 0; i < numPoolTokens; i++) {
            weights[i] = (poolWeights[i] * poolWeightSum) / ONE;
            weightSum += weights[i];
        }

        if (weightSum > ONE) {
            weights[0] -= weightSum - ONE;
        } else {
            weights[0] += ONE - weightSum;
        }

        return weights;
    }

    /// @notice Calculate the amounts of underlying assets of yield tokens to adjust.
    /// @dev Will only be called by adjustYieldTokens().
    /// @param underlyingIndexes Array of underlying indexes.
    /// @param poolHoldings Balances of tokens in Balancer Pool.
    /// @param underlyingBalances Total balance of underlying assets in yield tokens.
    /// @param targetWeights Target weights of tokens in Vault.
    /// @return depositAmounts Amounts of underlying assets to deposit to yield tokens.
    /// @return withdrawAmounts Amounts of underlying assets to withdraw from yield tokens.
    function calcAdjustmentAmounts(
        uint256[] memory underlyingIndexes,
        uint256[] memory poolHoldings,
        uint256[] memory underlyingBalances,
        uint256[] memory targetWeights
    )
        internal
        view
        returns (
            uint256[] memory depositAmounts,
            uint256[] memory withdrawAmounts
        )
    {
        (
            uint256[] memory oraclePrices,
            uint256[] memory updatedAt
        ) = getOraclePrices();

        checkOracleStatus(updatedAt);

        uint256 value = getValue(
            getUnderlyingTotalBalances(
                underlyingIndexes,
                poolHoldings,
                underlyingBalances
            ),
            oraclePrices
        );

        depositAmounts = new uint256[](numYieldTokens);
        withdrawAmounts = new uint256[](numYieldTokens);

        uint256 targetBalance;
        uint256 index = numPoolTokens;
        for (uint256 i = 0; i < numYieldTokens; i++) {
            if (targetWeights[index] > 0) {
                targetBalance =
                    (value * targetWeights[index]) /
                    oraclePrices[underlyingIndexes[i]];
            }
            if (targetBalance > underlyingBalances[i]) {
                depositAmounts[i] = targetBalance - underlyingBalances[i];
            } else {
                withdrawAmounts[i] = underlyingBalances[i] - targetBalance;
            }
            ++index;
        }
    }

    /// @notice Calculate the amounts of pool tokens to withdraw from Balancer Pool.
    /// @dev Will only be called by depositToYieldTokens().
    /// @param underlyingIndexes Array of underlying indexes.
    /// @param poolHoldings Balances of tokens in Balancer Pool.
    /// @param depositAmounts Amounts of underlying assets to deposit to yield tokens.
    /// @param balances The balance of underlying assets in Vault.
    /// @return necessaryAmounts Amounts of pool tokens to withdraw from Balancer Pool.
    function calcNecessaryAmounts(
        uint256[] memory underlyingIndexes,
        uint256[] memory poolHoldings,
        uint256[] memory depositAmounts,
        uint256[] memory balances
    ) internal view returns (uint256[] memory necessaryAmounts) {
        uint256[] memory availableHoldings = new uint256[](numPoolTokens);
        uint256[] memory poolWeights = pool.getNormalizedWeights();

        for (uint256 i = 0; i < numPoolTokens; i++) {
            availableHoldings[i] =
                (poolHoldings[i] * (poolWeights[i] - MIN_WEIGHT)) /
                poolWeights[i];
        }

        necessaryAmounts = new uint256[](numPoolTokens);

        for (uint256 i = 0; i < numYieldTokens; i++) {
            if (depositAmounts[i] > 0) {
                necessaryAmounts[underlyingIndexes[i]] += depositAmounts[i];
            }
        }
        for (uint256 i = 0; i < numPoolTokens; i++) {
            if (necessaryAmounts[i] <= balances[i]) {
                necessaryAmounts[i] = 0;
            } else if (
                necessaryAmounts[i] > availableHoldings[i] + balances[i]
            ) {
                necessaryAmounts[i] = availableHoldings[i];
            } else {
                necessaryAmounts[i] -= balances[i];
            }
        }
    }

    /// @notice Withdraw the amounts of pool tokens from the Balancer Pool.
    /// @dev Will only be called by depositToYieldTokens().
    /// @param tokens Array of pool tokens.
    /// @param balances The balance of underlying assets in Vault.
    /// @param necessaryAmounts Amounts of pool tokens to withdraw from Balancer Pool.
    /// @return newBalances Current balance of pool tokens in Vault after withdrawal.
    function withdrawNecessaryTokensFromPool(
        IERC20[] memory tokens,
        uint256[] memory balances,
        uint256[] memory necessaryAmounts
    ) internal returns (uint256[] memory newBalances) {
        newBalances = new uint256[](numPoolTokens);
        for (uint256 i = 0; i < numPoolTokens; i++) {
            newBalances[i] = balances[i];
        }

        uint256[] memory currentBalances = new uint256[](numPoolTokens);
        for (uint256 i = 0; i < numPoolTokens; i++) {
            if (necessaryAmounts[i] > 0) {
                currentBalances[i] = tokens[i].balanceOf(address(this));
            }
        }

        withdrawFromPool(necessaryAmounts);

        for (uint256 i = 0; i < numPoolTokens; i++) {
            if (necessaryAmounts[i] > 0) {
                newBalances[i] +=
                    tokens[i].balanceOf(address(this)) -
                    currentBalances[i];
            }
        }

        return newBalances;
    }

    /// @notice Deposit the amounts of underlying assets to yield tokens.
    /// @dev Will only be called by adjustYieldTokens().
    ///      After underlying assets are deposited to yield tokens, it deposits left
    ///      tokens to Balancer Pool.
    /// @param poolTokens Array of pool tokens.
    /// @param yieldTokens Array of yield tokens.
    /// @param underlyingIndexes Array of underlying indexes.
    /// @param poolHoldings Balances of tokens in Balancer Pool.
    /// @param depositAmounts Amounts of underlying assets to deposit to yield tokens.
    /// @param balances The balance of underlying assets in Vault.
    function depositToYieldTokens(
        IERC20[] memory poolTokens,
        IERC4626[] memory yieldTokens,
        uint256[] memory underlyingIndexes,
        uint256[] memory poolHoldings,
        uint256[] memory depositAmounts,
        uint256[] memory balances
    ) internal {
        uint256[] memory necessaryAmounts = calcNecessaryAmounts(
            underlyingIndexes,
            poolHoldings,
            depositAmounts,
            balances
        );

        balances = withdrawNecessaryTokensFromPool(
            poolTokens,
            balances,
            necessaryAmounts
        );

        uint256 underlyingIndex;
        uint256 depositedAmount;
        uint256 index = numPoolTokens;
        for (uint256 i = 0; i < numYieldTokens; i++) {
            underlyingIndex = underlyingIndexes[i];
            if (depositAmounts[i] > 0 && balances[underlyingIndex] > 0) {
                depositedAmount = depositUnderlyingAsset(
                    yieldTokens[i],
                    poolTokens[underlyingIndex],
                    Math.min(depositAmounts[i], balances[i])
                );
                balances[underlyingIndex] -= depositedAmount;
            }
            ++index;
        }

        for (uint256 i = 0; i < numPoolTokens; i++) {
            setAllowance(poolTokens[i], address(bVault), balances[i]);
        }

        depositToPool(balances);
    }

    /// @notice Deposit the amount of underlying asset to yield token.
    /// @dev Will only be called by depositToYieldTokens().
    /// @param yieldToken Yield token to mint.
    /// @param underlyingAsset Underlying asset to deposit.
    /// @param amount Amount of underlying asset to deposit to yield token.
    /// @return Exact deposited amount of underlying asset.
    // solhint-disable no-empty-blocks
    function depositUnderlyingAsset(
        IERC4626 yieldToken,
        IERC20 underlyingAsset,
        uint256 amount
    ) internal returns (uint256) {
        try yieldToken.maxDeposit(address(this)) returns (
            uint256 maxDepositAmount
        ) {
            // slither-disable-next-line variable-scope
            if (maxDepositAmount == 0) {
                return 0;
            }

            // slither-disable-next-line variable-scope
            uint256 depositAmount = Math.min(amount, maxDepositAmount);

            setAllowance(underlyingAsset, address(yieldToken), depositAmount);

            yieldToken.deposit(depositAmount, address(this));

            clearAllowance(underlyingAsset, address(yieldToken));

            return depositAmount;
        } catch {}

        return 0;
    }

    /// @notice Withdraw the amounts of underlying assets from yield tokens.
    /// @dev Will only be called by adjustYieldTokens().
    /// @param poolTokens Array of pool tokens.
    /// @param yieldTokens Array of yield tokens.
    /// @param underlyingIndexes Array of underlying indexes.
    /// @param withdrawAmounts Amounts of underlying assets to withdraw from yield tokens.
    /// @return amounts Exact withdrawn amounts of an underlying asset.
    function withdrawFromYieldTokens(
        IERC20[] memory poolTokens,
        IERC4626[] memory yieldTokens,
        uint256[] memory underlyingIndexes,
        uint256[] memory withdrawAmounts
    ) internal returns (uint256[] memory amounts) {
        amounts = new uint256[](numPoolTokens);

        uint256 underlyingIndex;
        uint256 index = numPoolTokens;
        for (uint256 i = 0; i < numYieldTokens; i++) {
            if (withdrawAmounts[i] > 0) {
                underlyingIndex = underlyingIndexes[i];
                amounts[underlyingIndex] += withdrawUnderlyingAsset(
                    yieldTokens[i],
                    poolTokens[underlyingIndex],
                    withdrawAmounts[i]
                );
            }
            ++index;
        }
    }

    /// @notice Withdraw the amount of underlying asset from yield token.
    /// @dev Will only be called by withdrawFromYieldTokens().
    /// @param yieldToken Yield token to redeem.
    /// @param underlyingAsset Underlying asset to withdraw.
    /// @param amount Amount of underlying asset to withdraw from yield token.
    /// @return Exact withdrawn amount of underlying asset.
    // solhint-disable no-empty-blocks
    function withdrawUnderlyingAsset(
        IERC4626 yieldToken,
        IERC20 underlyingAsset,
        uint256 amount
    ) internal returns (uint256) {
        try yieldToken.maxWithdraw(address(this)) returns (
            uint256 maxWithdrawalAmount
        ) {
            // slither-disable-next-line variable-scope
            if (maxWithdrawalAmount == 0) {
                return 0;
            }

            uint256 balance = underlyingAsset.balanceOf(address(this));

            // slither-disable-next-line variable-scope
            yieldToken.withdraw(
                Math.min(amount, maxWithdrawalAmount),
                address(this),
                address(this)
            );

            return underlyingAsset.balanceOf(address(this)) - balance;
        } catch {}

        return 0;
    }

    /// @notice Get oracle prices.
    /// @dev Will only be called by getDeterminedPrices()
    ///      and enableTradingWithOraclePrice().
    ///      It converts oracle prices to decimals 18.
    /// @return Array of oracle price and updatedAt.
    function getOraclePrices()
        internal
        view
        returns (uint256[] memory, uint256[] memory)
    {
        AggregatorV2V3Interface[] memory oracles = getOracles();
        uint256[] memory oracleUnits = getOracleUnits();
        uint256[] memory prices = new uint256[](numOracles);
        uint256[] memory updatedAt = new uint256[](numOracles);
        int256 answer;

        for (uint256 i = 0; i < numOracles; i++) {
            if (i == numeraireAssetIndex) {
                prices[i] = ONE;
                continue;
            }

            (, answer, , updatedAt[i], ) = oracles[i].latestRoundData();

            // Check if the price from the Oracle is valid as Aave does
            if (answer <= 0) {
                revert Aera__OraclePriceIsInvalid(i, answer);
            }

            prices[i] = uint256(answer);
            if (oracleUnits[i] != ONE) {
                prices[i] = (prices[i] * ONE) / oracleUnits[i];
            }
        }

        return (prices, updatedAt);
    }

    /// @notice Check oracle status.
    /// @dev Will only be called by enableTradingWithOraclePrice()
    ///      and getDeterminedPrices().
    ///      It checks if oracles are updated recently or if oracles are enabled to use.
    /// @param updatedAt Last updated timestamp of oracles to check.
    function checkOracleStatus(uint256[] memory updatedAt) internal view {
        if (!oraclesEnabled) {
            revert Aera__OraclesAreDisabled();
        }

        uint256 delay;

        for (uint256 i = 0; i < numOracles; i++) {
            if (i == numeraireAssetIndex) {
                continue;
            }

            delay = block.timestamp - updatedAt[i];
            if (delay > maxOracleDelay) {
                revert Aera__OracleIsDelayedBeyondMax(
                    i,
                    delay,
                    maxOracleDelay
                );
            }
        }
    }

    /// @notice Enable or disable swap.
    /// @dev Will only be called by initialDeposit(), initiateFinalization(),
    ///      enableTradingRiskingArbitrage(), enableTradingWithOraclePrice()
    ///      and disableTrading().
    /// @param swapEnabled Swap status.
    function setSwapEnabled(bool swapEnabled) internal {
        pool.setSwapEnabled(swapEnabled);
        // slither-disable-next-line reentrancy-events
        emit SetSwapEnabled(swapEnabled);
    }

    /// @notice Check weight change ratio for weight upgrade.
    /// @dev Will only be called by updateWeightsGradually().
    /// @param poolTokens IERC20 tokens of Balancer Pool.
    /// @param targetPoolWeights Target weights of pool tokens.
    /// @param startTime Timestamp at which weight movement should start.
    /// @param endTime Timestamp at which the weights should reach target values.
    function checkWeightChangeRatio(
        IERC20[] memory poolTokens,
        uint256[] memory targetPoolWeights,
        uint256 startTime,
        uint256 endTime
    ) internal view {
        uint256[] memory currentPoolWeights = pool.getNormalizedWeights();

        // Check if weight change ratio is exceeded
        uint256 duration = endTime - startTime;
        uint256 maximumRatio = MAX_WEIGHT_CHANGE_RATIO * duration;

        for (uint256 i = 0; i < numPoolTokens; i++) {
            uint256 changeRatio = getWeightChangeRatio(
                currentPoolWeights[i],
                targetPoolWeights[i]
            );

            if (changeRatio > maximumRatio) {
                revert Aera__WeightChangeRatioIsAboveMax(
                    address(poolTokens[i]),
                    changeRatio,
                    maximumRatio
                );
            }
        }
    }

    /// @notice Check withdraw amounts with holdings.
    /// @dev Will only be called by withdrawTokens().
    /// @param poolTokens Array of pool tokens.
    /// @param yieldTokens Array of yield tokens.
    /// @param holdings Current token balance in Balancer Pool and Aera Vault.
    /// @param amounts Array of amounts to check.
    function checkWithdrawAmount(
        IERC20[] memory poolTokens,
        IERC4626[] memory yieldTokens,
        uint256[] memory holdings,
        uint256[] memory amounts
    ) internal view {
        for (uint256 i = 0; i < numPoolTokens; i++) {
            if (amounts[i] > holdings[i]) {
                revert Aera__AmountExceedAvailable(
                    address(poolTokens[i]),
                    amounts[i],
                    holdings[i]
                );
            }
        }

        uint256 index = numPoolTokens;
        for (uint256 i = 0; i < numYieldTokens; i++) {
            if (amounts[index] > holdings[index]) {
                revert Aera__AmountExceedAvailable(
                    address(yieldTokens[i]),
                    amounts[index],
                    holdings[index]
                );
            }
            ++index;
        }
    }

    /// @notice Check vault initialization parameters.
    /// @dev Will only be called by constructor.
    /// @param vaultParams Initialization parameters.
    function checkVaultParams(NewVaultParams memory vaultParams) internal {
        if (numPoolTokens != vaultParams.weights.length) {
            revert Aera__ValueLengthIsNotSame(
                numPoolTokens,
                vaultParams.weights.length
            );
        }

        uint256 underlyingIndex;
        IERC4626 yieldToken;
        for (uint256 i = 0; i < numYieldTokens; i++) {
            underlyingIndex = vaultParams.yieldTokens[i].underlyingIndex;
            yieldToken = vaultParams.yieldTokens[i].token;
            if (
                address(vaultParams.poolTokens[underlyingIndex]) !=
                yieldToken.asset()
            ) {
                revert Aera__WrongUnderlyingIndex(
                    address(yieldToken),
                    underlyingIndex,
                    yieldToken.asset(),
                    address(vaultParams.poolTokens[underlyingIndex])
                );
            }
        }

        if (vaultParams.minFeeDuration == 0) {
            revert Aera__MinFeeDurationIsZero();
        }
        if (vaultParams.managementFee > MAX_MANAGEMENT_FEE) {
            revert Aera__ManagementFeeIsAboveMax(
                vaultParams.managementFee,
                MAX_MANAGEMENT_FEE
            );
        }

        checkPriceRelatedValues(vaultParams);

        if (bytes(vaultParams.description).length == 0) {
            revert Aera__DescriptionIsEmpty();
        }

        checkManagerAddress(vaultParams.manager);
    }

    /// @notice Check if the weights are valid.
    /// @dev Will only be called by initialDeposit(), enableTradingWithWeights()
    ///      and updateWeightsGradually().
    function checkWeights(uint256[] memory weights) internal pure {
        uint256 weightSum = 0;

        for (uint256 i = 0; i < weights.length; i++) {
            weightSum += weights[i];
        }

        if (weightSum != ONE) {
            revert Aera__SumOfWeightIsNotOne();
        }
    }

    /// @notice Check if price-related values are valid.
    /// @dev Will only be called by checkVaultParams().
    /// @param vaultParams Struct vault parameter to check.
    function checkPriceRelatedValues(NewVaultParams memory vaultParams)
        internal
        pure
    {
        if (vaultParams.minReliableVaultValue == 0) {
            revert Aera__MinReliableVaultValueIsZero();
        }
        if (vaultParams.minSignificantDepositValue == 0) {
            revert Aera__MinSignificantDepositValueIsZero();
        }
        if (vaultParams.maxOracleSpotDivergence == 0) {
            revert Aera__MaxOracleSpotDivergenceIsZero();
        }
        if (vaultParams.maxOracleDelay == 0) {
            revert Aera__MaxOracleDelayIsZero();
        }
    }

    /// @notice Check if the address can be a manager.
    /// @dev Will only be called by checkVaultParams() and setManager().
    /// @param newManager Address to check.
    function checkManagerAddress(address newManager) internal view {
        if (newManager == address(0)) {
            revert Aera__ManagerIsZeroAddress();
        }
        if (newManager == owner()) {
            revert Aera__ManagerIsOwner(newManager);
        }
    }
}
