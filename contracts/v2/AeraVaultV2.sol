// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../v1/dependencies/openzeppelin/SafeERC20.sol";
import "../v1/dependencies/openzeppelin/IERC20.sol";
import "../v1/dependencies/openzeppelin/Ownable.sol";
import "../v1/dependencies/openzeppelin/ReentrancyGuard.sol";
import "../v1/dependencies/openzeppelin/Math.sol";
import "../v1/dependencies/openzeppelin/ERC165Checker.sol";
import "../v2/dependencies/openzeppelin/Multicall.sol";
import "../v1/interfaces/IBManagedPoolFactory.sol";
import "../v1/interfaces/IBManagedPoolController.sol";
import "../v1/interfaces/IBMerkleOrchard.sol";
import "../v1/interfaces/IBVault.sol";
import "../v1/interfaces/IBManagedPool.sol";
import "../v1/interfaces/IWithdrawalValidator.sol";
import "./dependencies/chainlink/interfaces/AggregatorV2V3Interface.sol";
import "./interfaces/IAeraVaultV2.sol";
import "./OracleStorage.sol";

/// @title Risk-managed treasury vault.
/// @notice Managed n-asset vault that supports withdrawals
///         in line with a pre-defined validator contract.
/// @dev Vault owner is the asset owner.
contract AeraVaultV2 is
    IAeraVaultV2,
    OracleStorage,
    Multicall,
    Ownable,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;

    /// STORAGE ///

    uint256 internal constant ONE = 10**18;

    /// @notice Minimum period for weight change duration.
    uint256 private constant MINIMUM_WEIGHT_CHANGE_DURATION = 4 hours;

    /// @notice Maximum absolute change in swap fee.
    uint256 private constant MAXIMUM_SWAP_FEE_PERCENT_CHANGE = 0.005e18;

    /// @dev Address to represent unset manager in events.
    address private constant UNSET_MANAGER_ADDRESS = address(0);

    /// @notice Cooldown period for updating swap fee (1 minute).
    uint256 private constant SWAP_FEE_COOLDOWN_PERIOD = 1 minutes;

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

    /// @notice Balancer Managed Pool.
    IBManagedPool public immutable pool;

    /// @notice Balancer Managed Pool Controller.
    IBManagedPoolController public immutable poolController;

    /// @notice Balancer Merkle Orchard.
    IBMerkleOrchard public immutable merkleOrchard;

    /// @notice Pool ID of Balancer pool on Vault.
    bytes32 public immutable poolId;

    /// @notice Timestamp when vault is created.
    uint256 public immutable createdAt;

    /// @notice Minimum period to charge guaranteed management fee.
    uint256 public immutable minFeeDuration;

    /// @notice Minimum reliable vault TVL. It will be measured in base token terms.
    uint256 public immutable minReliableVaultValue;

    /// @notice Minimum significant deposit value. It will be measured in base token terms.
    uint256 public immutable minSignificantDepositValue;

    /// @notice Maximum oracle spot price divergence.
    uint256 public immutable maxOracleSpotDivergence;

    /// @notice Maximum update delay of oracles.
    uint256 public immutable maxOracleDelay;

    /// @notice Verifies withdraw limits.
    IWithdrawalValidator public immutable validator;

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

    /// @notice Controls vault parameters.
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

    /// @notice Yield bearing assets.
    YieldBearingAsset[] public yieldBearingAssets;

    /// @notice Weights of yield bearing assets.
    uint256[] public yieldBearingAssetWeights;

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
    /// @param allowances Token withdrawal allowances.
    /// @param weights Token weights following withdrawal.
    event Withdraw(
        uint256[] requestedAmounts,
        uint256[] amounts,
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

    /// @notice Emitted when enableTradingWithOraclePrice is called.
    /// @param prices Used oracle prices.
    /// @param weights Updated weights of tokens.
    event UpdateWeightsWithOraclePrice(uint256[] prices, uint256[] weights);

    /// @notice Emitted when cancelWeightUpdates is called.
    /// @param weights Current weights of tokens.
    event CancelWeightUpdates(uint256[] weights);

    /// @notice Emitted when using oracle prices is enabled/disabled.
    /// @param enabled New state of using oracle prices.
    event SetOraclesEnabled(bool enabled);

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

    error Aera__ValueLengthIsNotSame(uint256 numTokens, uint256 numValues);
    error Aera__DifferentTokensInPosition(
        address actual,
        address sortedToken,
        uint256 index
    );
    error Aera__ValidatorIsNotMatched(
        uint256 numTokens,
        uint256 numAllowances
    );
    error Aera__ValidatorIsNotValid(address validator);
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

    /// @dev Throws if called before vault is initialized.
    modifier whenInitialized() {
        if (!initialized) {
            revert Aera__VaultNotInitialized();
        }
        _;
    }

    /// @dev Throws if called after vault is finalized.
    modifier whenNotFinalized() {
        if (finalized) {
            revert Aera__VaultIsFinalized();
        }
        _;
    }

    /// FUNCTIONS ///

    /// @notice Initialize the contract by deploying new Balancer pool using the provided factory.
    /// @dev Tokens should be unique. Validator should conform to interface.
    ///      These are checked by Balancer in internal transactions:
    ///       If tokens are sorted in ascending order.
    ///       If swapFeePercentage is greater than minimum and less than maximum.
    ///       If total sum of weights is one.
    /// @param vaultParams Struct vault parameter.
    constructor(NewVaultParams memory vaultParams)
        OracleStorage(
            vaultParams.oracles,
            vaultParams.numeraireAssetIndex,
            vaultParams.tokens.length
        )
    {
        uint256 numTokens = vaultParams.tokens.length;

        checkVaultParams(vaultParams, numTokens);

        address[] memory assetManagers = new address[](numTokens);
        for (uint256 i = 0; i < numTokens; i++) {
            assetManagers[i] = address(this);
        }

        // Deploys a new ManagedPool from ManagedPoolFactory
        // create(
        //     ManagedPool.NewPoolParams memory poolParams,
        //     BasePoolController.BasePoolRights calldata basePoolRights,
        //     ManagedPoolController.ManagedPoolRights calldata managedPoolRights,
        //     uint256 minWeightChangeDuration,
        // )
        //
        // - poolParams.mustAllowlistLPs should be true to prevent other accounts
        //   to use joinPool
        // - minWeightChangeDuration should be zero so that weights can be updated immediately
        //   in deposit, withdraw, cancelWeightUpdates and enableTradingWithWeights.
        pool = IBManagedPool(
            IBManagedPoolFactory(vaultParams.factory).create(
                IBManagedPoolFactory.NewPoolParams({
                    vault: IBVault(address(0)),
                    name: vaultParams.name,
                    symbol: vaultParams.symbol,
                    tokens: vaultParams.tokens,
                    normalizedWeights: vaultParams.weights,
                    assetManagers: assetManagers,
                    swapFeePercentage: vaultParams.swapFeePercentage,
                    pauseWindowDuration: 0,
                    bufferPeriodDuration: 0,
                    owner: address(this),
                    swapEnabledOnStart: false,
                    mustAllowlistLPs: true,
                    managementSwapFeePercentage: 0
                }),
                IBManagedPoolFactory.BasePoolRights({
                    canTransferOwnership: false,
                    canChangeSwapFee: true,
                    canUpdateMetadata: false
                }),
                IBManagedPoolFactory.ManagedPoolRights({
                    canChangeWeights: true,
                    canDisableSwaps: true,
                    canSetMustAllowlistLPs: false,
                    canSetCircuitBreakers: false,
                    canChangeTokens: false
                }),
                0
            )
        );

        // slither-disable-next-line reentrancy-benign
        bVault = pool.getVault();
        poolController = IBManagedPoolController(pool.getOwner());
        merkleOrchard = IBMerkleOrchard(vaultParams.merkleOrchard);
        poolId = pool.getPoolId();
        manager = vaultParams.manager;
        validator = IWithdrawalValidator(vaultParams.validator);
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

        uint256 numYieldBearingAssets = vaultParams.yieldBearingAssets.length;
        yieldBearingAssetWeights = new uint256[](numYieldBearingAssets);

        for (uint256 i = 0; i < numYieldBearingAssets; i++) {
            yieldBearingAssets.push(vaultParams.yieldBearingAssets[i]);
        }

        // slither-disable-next-line reentrancy-events
        emit Created(vaultParams);
        // slither-disable-next-line reentrancy-events
        emit ManagerChanged(UNSET_MANAGER_ADDRESS, vaultParams.manager);
    }

    /// PROTOCOL API ///

    /// @inheritdoc IProtocolAPIV2
    function initialDeposit(
        TokenValue[] calldata tokenWithAmount,
        TokenValue[] calldata tokenWithWeight
    ) external override onlyOwner {
        if (initialized) {
            revert Aera__VaultIsAlreadyInitialized();
        }

        initialized = true;
        lastFeeCheckpoint = block.timestamp;

        IERC20[] memory tokens = getTokens();
        uint256 numTokens = tokens.length;
        uint256[] memory balances = new uint256[](numTokens);
        uint256[] memory underlyingAssetWeights = new uint256[](numTokens);
        uint256[] memory amounts = getValuesFromTokenWithValues(
            tokenWithAmount,
            tokens,
            false
        );
        uint256[] memory weights = getValuesFromTokenWithValues(
            tokenWithWeight,
            tokens,
            true
        );

        uint256 weightSum;
        for (uint256 i = 0; i < weights.length; i++) {
            weightSum += weights[i];
        }
        if (weightSum != ONE) {
            revert Aera__SumOfWeightIsNotOne();
        }

        for (uint256 i = 0; i < numTokens; i++) {
            balances[i] = depositToken(tokens[i], amounts[i]);
            underlyingAssetWeights[i] = weights[i];
        }

        uint256 numYieldBearingAssets = yieldBearingAssets.length;
        if (numYieldBearingAssets > 0) {
            (
                uint256[] memory oraclePrices,
                uint256[] memory updatedAt
            ) = getOraclePrices();

            checkOracleStatus(updatedAt);
            uint256 value = getValue(amounts, oraclePrices);

            IERC20 underlyingAsset;
            uint256 yieldBearingDepositAmount;
            uint256 allowance;
            for (uint256 i = 0; i < numYieldBearingAssets; i++) {
                yieldBearingAssetWeights[i] = weights[i + numTokens];
                weightSum -= yieldBearingAssetWeights[i];
                yieldBearingDepositAmount =
                    (value * yieldBearingAssetWeights[i]) /
                    oraclePrices[yieldBearingAssets[i].underlyingAssetIndex];

                underlyingAsset = tokens[
                    yieldBearingAssets[i].underlyingAssetIndex
                ];
                allowance = underlyingAsset.allowance(
                    address(this),
                    address(yieldBearingAssets[i].asset)
                );
                if (allowance > 0) {
                    underlyingAsset.safeDecreaseAllowance(
                        address(yieldBearingAssets[i].asset),
                        allowance
                    );
                }
                underlyingAsset.safeIncreaseAllowance(
                    address(yieldBearingAssets[i].asset),
                    yieldBearingDepositAmount
                );
                yieldBearingAssets[i].asset.deposit(
                    yieldBearingDepositAmount,
                    address(this)
                );

                balances[i] -= yieldBearingDepositAmount;
            }
        }

        bytes memory initUserData = abi.encode(
            IBVault.JoinKind.INIT,
            balances
        );

        IBVault.JoinPoolRequest memory joinPoolRequest = IBVault
            .JoinPoolRequest({
                assets: tokens,
                maxAmountsIn: balances,
                userData: initUserData,
                fromInternalBalance: false
            });
        bVault.joinPool(poolId, address(this), address(this), joinPoolRequest);

        updateWeights(underlyingAssetWeights, weightSum);

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
        (, , uint256 lastChangeBlock) = getTokensData();

        if (lastChangeBlock == block.number) {
            revert Aera__BalanceChangedInCurrentBlock();
        }

        depositTokensAndUpdateWeights(tokenWithAmount, PriceType.DETERMINED);
    }

    /// @inheritdoc IProtocolAPIV2
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

    /// @inheritdoc IProtocolAPIV2
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
        (, , uint256 lastChangeBlock) = getTokensData();

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
        (, , uint256 lastChangeBlock) = getTokensData();

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
            managersFee[newManager] = new uint256[](getTokens().length);
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

        IERC20[] memory tokens = getTokens();

        uint256[] memory weights = getValuesFromTokenWithValues(
            tokenWithWeight,
            tokens,
            false
        );

        poolController.updateWeightsGradually(
            block.timestamp,
            block.timestamp,
            weights
        );
        poolController.setSwapEnabled(true);
        // slither-disable-next-line reentrancy-events
        emit EnabledTradingWithWeights(block.timestamp, weights);
    }

    /// @inheritdoc IProtocolAPIV2
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

        uint256[] memory holdings = getHoldings();
        uint256 numHoldings = holdings.length;
        uint256[] memory weights = new uint256[](numHoldings);
        uint256 weightSum = ONE;
        uint256 holdingsRatio;
        uint256 numeraireAssetHolding = holdings[numeraireAssetIndex];
        weights[numeraireAssetIndex] = ONE;

        for (uint256 i = 0; i < numHoldings; i++) {
            if (i == numeraireAssetIndex) {
                continue;
            }

            // slither-disable-next-line divide-before-multiply
            holdingsRatio = (holdings[i] * ONE) / numeraireAssetHolding;
            weights[i] = (holdingsRatio * ONE) / prices[i];
            weightSum += weights[i];
        }

        updateWeights(weights, weightSum);
        setSwapEnabled(true);

        emit UpdateWeightsWithOraclePrice(prices, pool.getNormalizedWeights());
    }

    /// @inheritdoc IProtocolAPIV2
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

        // Check if weight change ratio is exceeded
        uint256[] memory weights = pool.getNormalizedWeights();
        IERC20[] memory tokens = getTokens();
        uint256 numTokens = tokens.length;
        uint256[] memory targetWeights = getValuesFromTokenWithValues(
            tokenWithWeight,
            tokens,
            false
        );
        uint256 duration = endTime - startTime;
        uint256 maximumRatio = MAX_WEIGHT_CHANGE_RATIO * duration;

        for (uint256 i = 0; i < numTokens; i++) {
            uint256 changeRatio = getWeightChangeRatio(
                weights[i],
                targetWeights[i]
            );

            if (changeRatio > maximumRatio) {
                revert Aera__WeightChangeRatioIsAboveMax(
                    address(tokens[i]),
                    changeRatio,
                    maximumRatio
                );
            }
        }

        poolController.updateWeightsGradually(
            startTime,
            endTime,
            targetWeights
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
        uint256 numWeights = weights.length;
        uint256 weightSum;

        for (uint256 i = 0; i < numWeights; i++) {
            weightSum += weights[i];
        }

        updateWeights(weights, weightSum);

        // slither-disable-next-line reentrancy-events
        emit CancelWeightUpdates(weights);
    }

    function setTargetWeights(TokenValue[] calldata tokenWithWeight)
        external
        nonReentrant
        onlyManager
    {
        IERC20[] memory tokens = getTokens();
        uint256 numTokens = tokens.length;
        uint256[] memory weights = getValuesFromTokenWithValues(
            tokenWithWeight,
            tokens,
            true
        );

        uint256 weightSum;
        for (uint256 i = 0; i < weights.length; i++) {
            weightSum += weights[i];
        }
        if (weightSum != ONE) {
            revert Aera__SumOfWeightIsNotOne();
        }

        uint256 numYieldBearingAssets = yieldBearingAssets.length;
        uint256[] memory underlyingAssetBalances = new uint256[](
            numYieldBearingAssets
        );
        uint256[] memory depositAmounts = new uint256[](numTokens);
        uint256[] memory withdrawAmounts = new uint256[](numTokens);
        uint256[] memory holdings = getHoldings();
        for (uint256 i = 0; i < numYieldBearingAssets; i++) {
            underlyingAssetBalances[i] = yieldBearingAssets[i]
                .asset
                .convertToAssets(
                    yieldBearingAssets[i].asset.balanceOf(address(this))
                );
            holdings[
                yieldBearingAssets[i].underlyingAssetIndex
            ] += underlyingAssetBalances[i];
        }

        (
            uint256[] memory oraclePrices,
            uint256[] memory updatedAt
        ) = getOraclePrices();

        checkOracleStatus(updatedAt);
        uint256 value = getValue(holdings, oraclePrices);

        uint256 underlyingAssetIndex;
        uint256 targetBalance;
        uint256 yieldBearingWithdrawAmount;
        IERC20 underlyingAsset;
        for (uint256 i = 0; i < numYieldBearingAssets; i++) {
            underlyingAssetIndex = yieldBearingAssets[i].underlyingAssetIndex;
            targetBalance = (value * weights[i]) / ONE;
            underlyingAsset = tokens[
                yieldBearingAssets[i].underlyingAssetIndex
            ];
            if (underlyingAssetBalances[i] > targetBalance) {
                yieldBearingWithdrawAmount =
                    underlyingAssetBalances[i] -
                    targetBalance;
                depositAmounts[
                    underlyingAssetIndex
                ] += yieldBearingWithdrawAmount;
                yieldBearingAssets[i].asset.withdraw(
                    yieldBearingWithdrawAmount,
                    address(this),
                    address(this)
                );
            } else if (underlyingAssetBalances[i] < targetBalance) {
                withdrawAmounts[underlyingAssetIndex] +=
                    targetBalance -
                    underlyingAssetBalances[i];
            }
        }

        for (uint256 i = 0; i < numTokens; i++) {
            if (
                depositAmounts[i] > withdrawAmounts[i] &&
                withdrawAmounts[i] > 0
            ) {
                depositAmounts[i] -= withdrawAmounts[i];
                withdrawAmounts[i] = 0;
            } else if (
                depositAmounts[i] < withdrawAmounts[i] && depositAmounts[i] > 0
            ) {
                withdrawAmounts[i] -= depositAmounts[i];
                depositAmounts[i] = 0;
            }

            if (withdrawAmounts[i] > holdings[i]) {
                withdrawAmounts[i] = 0;
            }
        }
        /// Set managed balance of pool as amounts
        /// i.e. Deposit amounts of tokens to pool from Aera Vault
        updatePoolBalance(depositAmounts, IBVault.PoolBalanceOpKind.UPDATE);
        /// Decrease managed balance and increase cash balance of pool
        /// i.e. Move amounts from managed balance to cash balance
        updatePoolBalance(depositAmounts, IBVault.PoolBalanceOpKind.DEPOSIT);

        withdrawFromPool(withdrawAmounts);

        uint256 yieldBearingDepositAmount;
        uint256 allowance;
        for (uint256 i = 0; i < numYieldBearingAssets; i++) {
            targetBalance = (value * weights[i]) / ONE;
            yieldBearingDepositAmount =
                targetBalance -
                underlyingAssetBalances[i];
            underlyingAsset = tokens[
                yieldBearingAssets[i].underlyingAssetIndex
            ];
            allowance = underlyingAsset.allowance(
                address(this),
                address(yieldBearingAssets[i].asset)
            );
            if (allowance > 0) {
                underlyingAsset.safeDecreaseAllowance(
                    address(yieldBearingAssets[i].asset),
                    allowance
                );
            }
            underlyingAsset.safeIncreaseAllowance(
                address(yieldBearingAssets[i].asset),
                yieldBearingDepositAmount
            );
            yieldBearingAssets[i].asset.deposit(
                yieldBearingDepositAmount,
                address(this)
            );
        }
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

        poolController.setSwapFeePercentage(newSwapFee);
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

        IERC20[] memory tokens;
        uint256[] memory holdings;
        (tokens, holdings, ) = getTokensData();

        uint256 numTokens = tokens.length;
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

    /// @inheritdoc IUserAPI
    function acceptOwnership() external override {
        if (msg.sender != pendingOwner) {
            revert Aera__NotPendingOwner();
        }
        _transferOwnership(pendingOwner);
        pendingOwner = address(0);
    }

    /// INTERNAL FUNCTIONS ///

    /// @notice Deposit amount of tokens and update weights.
    /// @dev Will only be called by deposit(), depositIfBalanceUnchanged(),
    ///      depositRiskingArbitrage() and depositRiskingArbitrageIfBalanceUnchanged().
    ///      It calls updateWeights() function which cancels
    ///      current active weights change schedule.
    /// @param tokenWithAmount Deposit tokens with amount.
    /// @param priceType Price type to be used.
    // slither-disable-next-line uninitialized-local
    function depositTokensAndUpdateWeights(
        TokenValue[] calldata tokenWithAmount,
        PriceType priceType
    ) internal {
        lockManagerFees(false);

        IERC20[] memory tokens;
        uint256[] memory holdings;
        (tokens, holdings, ) = getTokensData();
        uint256 numTokens = tokens.length;

        uint256[] memory amounts = getValuesFromTokenWithValues(
            tokenWithAmount,
            tokens,
            false
        );

        // slither-disable-next-line uninitialized-local
        uint256[] memory determinedPrices;
        if (priceType == PriceType.DETERMINED) {
            (determinedPrices, priceType) = getDeterminedPrices(amounts);
        }

        depositTokens(tokens, amounts, numTokens);

        uint256[] memory weights = pool.getNormalizedWeights();
        uint256[] memory newHoldings = getHoldings();
        uint256[] memory newBalances = new uint256[](numTokens);
        uint256 weightSum;

        if (priceType == PriceType.ORACLE) {
            uint256 numeraireAssetHolding = newHoldings[numeraireAssetIndex];
            weights[numeraireAssetIndex] = ONE;
            for (uint256 i = 0; i < numTokens; i++) {
                if (i != numeraireAssetIndex) {
                    weights[i] =
                        (newHoldings[i] * determinedPrices[i]) /
                        numeraireAssetHolding;
                }
                if (amounts[i] != 0) {
                    newBalances[i] = newHoldings[i] - holdings[i];
                }

                weightSum += weights[i];
            }
        } else {
            for (uint256 i = 0; i < numTokens; i++) {
                if (amounts[i] != 0) {
                    weights[i] = (weights[i] * newHoldings[i]) / holdings[i];
                    newBalances[i] = newHoldings[i] - holdings[i];
                }

                weightSum += weights[i];
            }
        }

        /// It cancels current active weights change schedule
        /// and update weights with newWeights
        updateWeights(weights, weightSum);

        // slither-disable-next-line reentrancy-events
        emit Deposit(amounts, newBalances, pool.getNormalizedWeights());
    }

    /// @notice Deposit amount of tokens.
    /// @dev Will only be called by depositTokensAndUpdateWeights().
    /// @param tokens Array of pool tokens.
    /// @param amounts Deposit token amounts.
    /// @param numTokens Number of tokens.
    function depositTokens(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256 numTokens
    ) internal {
        uint256[] memory newBalances = new uint256[](numTokens);

        for (uint256 i = 0; i < numTokens; i++) {
            if (amounts[i] != 0) {
                newBalances[i] = depositToken(tokens[i], amounts[i]);
            }
        }

        /// Set managed balance of pool as amounts
        /// i.e. Deposit amounts of tokens to pool from Aera Vault
        updatePoolBalance(newBalances, IBVault.PoolBalanceOpKind.UPDATE);
        /// Decrease managed balance and increase cash balance of pool
        /// i.e. Move amounts from managed balance to cash balance
        updatePoolBalance(newBalances, IBVault.PoolBalanceOpKind.DEPOSIT);
    }

    /// @notice Withdraw tokens up to requested amounts.
    /// @dev Will only be called by withdraw() and withdrawIfBalanceUnchanged()
    ///      It calls updateWeights() function which cancels
    ///      current active weights change schedule.
    /// @param tokenWithAmount Requested tokens with amount.
    function withdrawTokens(TokenValue[] calldata tokenWithAmount) internal {
        lockManagerFees(false);

        IERC20[] memory tokens;
        uint256[] memory holdings;
        (tokens, holdings, ) = getTokensData();
        uint256 numTokens = tokens.length;

        uint256[] memory allowances = validator.allowance();
        uint256[] memory weights = pool.getNormalizedWeights();
        uint256[] memory balances = new uint256[](numTokens);
        uint256[] memory amounts = getValuesFromTokenWithValues(
            tokenWithAmount,
            tokens,
            false
        );

        for (uint256 i = 0; i < numTokens; i++) {
            if (amounts[i] > holdings[i] || amounts[i] > allowances[i]) {
                revert Aera__AmountExceedAvailable(
                    address(tokens[i]),
                    amounts[i],
                    Math.min(holdings[i], allowances[i])
                );
            }

            if (amounts[i] != 0) {
                balances[i] = tokens[i].balanceOf(address(this));
            }
        }

        withdrawFromPool(amounts);

        uint256 weightSum;

        for (uint256 i = 0; i < numTokens; i++) {
            if (amounts[i] != 0) {
                balances[i] = tokens[i].balanceOf(address(this)) - balances[i];
                tokens[i].safeTransfer(owner(), balances[i]);

                uint256 newBalance = holdings[i] - amounts[i];
                weights[i] = (weights[i] * newBalance) / holdings[i];
            }

            weightSum += weights[i];
        }

        /// It cancels current active weights change schedule
        /// and update weights with newWeights
        updateWeights(weights, weightSum);

        // slither-disable-next-line reentrancy-events
        emit Withdraw(
            amounts,
            balances,
            allowances,
            pool.getNormalizedWeights()
        );
    }

    /// @notice Withdraw tokens from Balancer Pool to Aera Vault
    /// @dev Will only be called by withdrawTokens(), returnFunds()
    ///      and lockManagerFees()
    function withdrawFromPool(uint256[] memory amounts) internal {
        uint256[] memory managed = new uint256[](amounts.length);

        /// Decrease cash balance and increase managed balance of pool
        /// i.e. Move amounts from cash balance to managed balance
        /// and withdraw token amounts from pool to Aera Vault
        updatePoolBalance(amounts, IBVault.PoolBalanceOpKind.WITHDRAW);
        /// Adjust managed balance of pool as the zero array
        updatePoolBalance(managed, IBVault.PoolBalanceOpKind.UPDATE);
    }

    /// @notice Calculate manager fees and lock the tokens in Vault.
    /// @dev Will only be called by claimManagerFees(), setManager(),
    ///      finalize(), depositTokensAndUpdateWeights()
    ///      and withdrawTokens().
    /// @param lockGuaranteedFee True if guaranteed fee should be locked.
    function lockManagerFees(bool lockGuaranteedFee) internal {
        if (managementFee == 0) {
            return;
        }

        // slither-disable-next-line uninitialized-local
        uint256 feeIndex;
        if (block.timestamp > lastFeeCheckpoint) {
            feeIndex = block.timestamp - lastFeeCheckpoint;
        }

        if (lockGuaranteedFee) {
            uint256 minFeeCheckpoint = createdAt + minFeeDuration;

            if (minFeeCheckpoint > block.timestamp) {
                feeIndex += (minFeeCheckpoint - block.timestamp);
            }
        }

        // slither-disable-next-line incorrect-equality
        if (feeIndex == 0) {
            return;
        }

        IERC20[] memory tokens;
        uint256[] memory holdings;
        (tokens, holdings, ) = getTokensData();

        uint256 numTokens = tokens.length;
        uint256[] memory newFees = new uint256[](numTokens);
        uint256[] memory balances = new uint256[](numTokens);

        for (uint256 i = 0; i < numTokens; i++) {
            balances[i] = tokens[i].balanceOf(address(this));
            newFees[i] = (holdings[i] * feeIndex * managementFee) / ONE;
        }

        lastFeeCheckpoint = block.timestamp;

        withdrawFromPool(newFees);

        for (uint256 i = 0; i < numTokens; i++) {
            newFees[i] = tokens[i].balanceOf(address(this)) - balances[i];
            // slither-disable-next-line reentrancy-benign
            managersFee[manager][i] += newFees[i];
            managersFeeTotal[i] += newFees[i];
        }
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

    /// @notice Return an array of values from given tokenWithValues.
    /// @dev Will only be called by initialDeposit(), enableTradingWithWeights(),
    ///      depositTokensAndUpdateWeights(), withdrawTokens()
    ///      and updateWeightsGradually()
    ///      The values could be amounts or weights.
    /// @param tokenWithValues Tokens with values.
    /// @param tokens Array of pool tokens.
    /// @return Array of values.
    function getValuesFromTokenWithValues(
        TokenValue[] calldata tokenWithValues,
        IERC20[] memory tokens,
        bool withYieldBearingAssets
    ) internal view returns (uint256[] memory) {
        uint256 numTokens = tokens.length;
        uint256 numYieldBearingAssets = yieldBearingAssets.length;
        uint256 numTokenWithValues = tokenWithValues.length;

        if (!withYieldBearingAssets && numTokens != numTokenWithValues) {
            revert Aera__ValueLengthIsNotSame(numTokens, numTokenWithValues);
        }
        if (
            withYieldBearingAssets &&
            numTokens + numYieldBearingAssets != numTokenWithValues
        ) {
            revert Aera__ValueLengthIsNotSame(
                numTokens + numYieldBearingAssets,
                numTokenWithValues
            );
        }

        uint256[] memory values = new uint256[](numTokens);
        for (uint256 i = 0; i < numTokens; i++) {
            if (tokenWithValues[i].token != address(tokens[i])) {
                revert Aera__DifferentTokensInPosition(
                    tokenWithValues[i].token,
                    address(tokens[i]),
                    i
                );
            }
            values[i] = tokenWithValues[i].value;
        }

        if (withYieldBearingAssets) {
            for (uint256 i = 0; i < numYieldBearingAssets; i++) {
                uint256 index = i + numTokens;
                if (
                    tokenWithValues[index].token !=
                    address(yieldBearingAssets[i].asset)
                ) {
                    revert Aera__DifferentTokensInPosition(
                        tokenWithValues[index].token,
                        address(yieldBearingAssets[i].asset),
                        index
                    );
                }
                values[index] = tokenWithValues[index].value;
            }
        }

        return values;
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

        bytes32 balancerPoolId = poolId;
        for (uint256 i = 0; i < numAmounts; i++) {
            ops[i].kind = kind;
            ops[i].poolId = balancerPoolId;
            ops[i].token = tokens[i];
            ops[i].amount = amounts[i];
        }

        bVault.managePoolBalance(ops);
    }

    /// @notice Update weights of tokens in the pool.
    /// @dev Will only be called by depositTokensAndUpdateWeights(),
    ///      withdrawTokens(), enableTradingWithOraclePrice()
    ///      and cancelWeightUpdates().
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

        poolController.updateWeightsGradually(
            block.timestamp,
            block.timestamp,
            newWeights
        );
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

        // slither-disable-next-line calls-loop
        uint256 allowance = token.allowance(address(this), address(bVault));
        if (allowance > 0) {
            token.safeDecreaseAllowance(address(bVault), allowance);
        }
        token.safeIncreaseAllowance(address(bVault), balance);

        return balance;
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
            amount = token.balanceOf(address(this)) - managersFeeTotal[i];
            token.safeTransfer(owner(), amount);
            amounts[i] = amount;
        }
    }

    /// @notice Determine best prices for deposits.
    /// @dev Will only be called by depositTokensAndUpdateWeights().
    /// @param amounts Deposit token amounts.
    /// @return prices Determined token prices.
    /// @return priceType Determined price type.
    function getDeterminedPrices(uint256[] memory amounts)
        internal
        returns (uint256[] memory prices, PriceType priceType)
    {
        uint256[] memory holdings = getHoldings();
        (
            uint256[] memory oraclePrices,
            uint256[] memory updatedAt
        ) = getOraclePrices();
        uint256[] memory spotPrices = getSpotPrices(holdings);

        if (getValue(holdings, spotPrices) < minReliableVaultValue) {
            checkOracleStatus(updatedAt);
            return (oraclePrices, PriceType.ORACLE);
        }

        uint256 ratio;

        for (uint256 i = 0; i < holdings.length; i++) {
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

    /// @notice Calculate value of token amounts in base token term.
    /// @dev Will only be called by getDeterminedPrices().
    /// @param amounts Token amounts.
    /// @param prices Token prices in base token.
    /// @return Total value in base token term.
    function getValue(uint256[] memory amounts, uint256[] memory prices)
        internal
        view
        returns (uint256)
    {
        uint256 value;

        for (uint256 i = 0; i < amounts.length; i++) {
            if (i == numeraireAssetIndex) {
                value += amounts[i];
                continue;
            }

            value += ((amounts[i] * prices[i]) / ONE);
        }

        return value;
    }

    /// @notice Calculate spot prices of tokens vs base token.
    /// @dev Will only be called by getDeterminedPrices().
    /// @param holdings Balances of tokens of Balancer pool.
    /// @return Spot prices of tokens vs base token.
    function getSpotPrices(uint256[] memory holdings)
        internal
        view
        returns (uint256[] memory)
    {
        uint256[] memory weights = pool.getNormalizedWeights();
        uint256 numHoldings = holdings.length;
        uint256[] memory prices = new uint256[](numHoldings);
        uint256 swapFee = pool.getSwapFeePercentage();
        uint256 numeraireAssetHolding = holdings[numeraireAssetIndex];
        uint256 numeraireAssetWeight = weights[numeraireAssetIndex];

        for (uint256 i = 0; i < numHoldings; i++) {
            if (i == numeraireAssetIndex) {
                prices[i] = ONE;
                continue;
            }
            prices[i] = calcSpotPrice(
                holdings[i],
                weights[i],
                numeraireAssetHolding,
                numeraireAssetWeight,
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
    ///      It checks if oracles are updated recently or oracles are enabled to use.
    /// @param updatedAt Last updated timestamp of oracles to check.
    function checkOracleStatus(uint256[] memory updatedAt) internal {
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
        poolController.setSwapEnabled(swapEnabled);
        // slither-disable-next-line reentrancy-events
        emit SetSwapEnabled(swapEnabled);
    }

    /// @notice Check if the vaultParam is valid.
    /// @dev Will only be called by constructor.
    /// @param vaultParams Struct vault parameter to check.
    /// @param numTokens Number of tokens.
    function checkVaultParams(
        NewVaultParams memory vaultParams,
        uint256 numTokens
    ) internal {
        if (numTokens != vaultParams.weights.length) {
            revert Aera__ValueLengthIsNotSame(
                numTokens,
                vaultParams.weights.length
            );
        }

        checkValidator(vaultParams, numTokens);

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

    /// @notice Check if the validator is valid.
    /// @dev Will only be called by checkVaultParams().
    /// @param vaultParams Struct vault parameter to check.
    /// @param numTokens Number of tokens.
    function checkValidator(
        NewVaultParams memory vaultParams,
        uint256 numTokens
    ) internal {
        if (
            !ERC165Checker.supportsInterface(
                vaultParams.validator,
                type(IWithdrawalValidator).interfaceId
            )
        ) {
            revert Aera__ValidatorIsNotValid(vaultParams.validator);
        }

        uint256 numAllowances = IWithdrawalValidator(vaultParams.validator)
            .allowance()
            .length;
        if (numTokens != numAllowances) {
            revert Aera__ValidatorIsNotMatched(numTokens, numAllowances);
        }
    }

    /// @notice Check if price-related values are valid.
    /// @dev Will only be called by checkVaultParams().
    /// @param vaultParams Struct vault parameter to check.
    function checkPriceRelatedValues(NewVaultParams memory vaultParams)
        internal
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
    function checkManagerAddress(address newManager) internal {
        if (newManager == address(0)) {
            revert Aera__ManagerIsZeroAddress();
        }
        if (newManager == owner()) {
            revert Aera__ManagerIsOwner(newManager);
        }
    }
}
