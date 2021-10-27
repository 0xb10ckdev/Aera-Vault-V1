// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

import "./dependencies/openzeppelin/SafeERC20.sol";
import "./dependencies/openzeppelin/IERC20.sol";
import "./dependencies/openzeppelin/IERC165.sol";
import "./dependencies/openzeppelin/Ownable.sol";
import "./dependencies/openzeppelin/ReentrancyGuard.sol";
import "./dependencies/openzeppelin/Math.sol";
import "./dependencies/openzeppelin/SafeCast.sol";
import "./interfaces/IBFactory.sol";
import "./interfaces/IBPool.sol";
import "./interfaces/IMammonVaultV0.sol";
import "./interfaces/IWithdrawalValidator.sol";
import "./libraries/SmartPoolManager.sol";

/**
 * @dev Represents a treasury vault that is managed by Mammon.
 * Owner is original asset owner that can add and withdraw funds.
 */
contract MammonVaultV0 is IMammonVaultV0, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;
    using SafeCast for uint256;

    uint256 private constant ONE = 10**18;

    /// @notice The maximum notice period for vault termination (2 months).
    uint32 private constant MAX_NOTICE_PERIOD = 60 days;

    /// @notice The address for unset manager
    address private constant UNSET_MANAGER_ADDRESS = address(0);

    /// @notice The minimum value of change block period for weights update
    uint256 private constant MAX_WEIGHT_CHANGE_BLOCK_PERIOD = 1000;

    /// @notice The maximum weight change ratio per one block
    /// @dev It's the increment/decrement factor per one block
    ///      increment/decrement factor per n blocks: Fn = f * n
    ///      Spot price growth range for n blocks: [1 / Fn - 1, Fn - 1]
    ///      E.g. increment/decrement factor per 200 blocks is 2
    ///      Spot price growth range for 200 blocks is [-50%, 100%]
    uint256 private constant MAX_WEIGHT_CHANGE_RATIO_PER_BLOCK = 10**16;

    /// @notice Balancer pool. Owned by the vault.
    IBPool public immutable pool;

    /// @notice First token address in vault
    address public immutable token0;

    /// @notice Second token address in vault
    address public immutable token1;

    /// @notice Notice period for vault termination (in seconds).
    uint32 public immutable noticePeriod;

    /// @notice Verifies withdraw limits
    IWithdrawalValidator public immutable validator;
    // slot start

    /// @notice Submits new balance parameters for the vault
    address public manager;

    /// @notice Timestamp when notice elapses or 0 if not yet set
    uint64 public noticeTimeoutAt;

    /// @notice Indicates that the Vault has been initialized
    bool public initialized;
    // slot end, 3 bytes left

    SmartPoolManager.GradualUpdateParams private gradualUpdate;

    /// @notice Emitted when the vault is created.
    /// @param factory The address of balancer factory.
    /// @param token0 The address of the first token.
    /// @param token1 The address of the second token.
    /// @param manager The address of a manager of the vault
    /// @param validator The address of a withdrawal validator contract
    /// @param noticePeriod Notice period in seconds.
    event Created(
        address indexed factory,
        address indexed token0,
        address indexed token1,
        address manager,
        address validator,
        uint32 noticePeriod
    );

    /// @notice Emitted when tokens are deposited.
    /// @param amount0 The amount of the first token.
    /// @param amount1 The amount of the second token.
    /// @param weight0 The weight of the first token.
    /// @param weight1 The weight of the second token.
    event Deposit(
        uint256 amount0,
        uint256 amount1,
        uint256 weight0,
        uint256 weight1
    );

    /// @notice Emitted when tokens are withdrawed.
    /// @param requestedAmount0 The requested amount of the first token.
    /// @param requestedAmount1 The requested amount of the second token.
    /// @param withdrawnAmount0 The withdrawn amount of the first token.
    /// @param withdrawnAmount1 The withdrawn amount of the second token.
    /// @param allowance0 The allowance of the first token.
    /// @param allowance1 The allowance of the second token.
    /// @param finalWeight0 The weight of the first token.
    /// @param finalWeight1 The weight of the second token.
    event Withdraw(
        uint256 requestedAmount0,
        uint256 requestedAmount1,
        uint256 withdrawnAmount0,
        uint256 withdrawnAmount1,
        uint256 allowance0,
        uint256 allowance1,
        uint256 finalWeight0,
        uint256 finalWeight1
    );

    /// @notice Emitted when the manager is changed.
    /// @param previousManager The address of the previous manager.
    /// @param manager The address of a new manager.
    event ManagerChanged(
        address indexed previousManager,
        address indexed manager
    );

    /// @notice Emitted when updateWeightsGradually is called.
    /// @param weight0 The target weight of the first token.
    /// @param weight1 The target weight of the second token.
    /// @param startBlock Start block number of updates.
    /// @param endBlock End block number of updates.
    event UpdateWeightsGradually(
        uint256 weight0,
        uint256 weight1,
        uint256 startBlock,
        uint256 endBlock
    );

    /// @notice Emitted when pokeWeights is called.
    event PokeWeights();

    /// @notice Emitted when public swap is turned on/off.
    /// @param publicSwap New state of public swap.
    event SetPublicSwap(bool publicSwap);

    /// @notice Emitted when swap fee is updated.
    /// @param swapFee New swap fee.
    event SetSwapFee(uint256 swapFee);

    /// @notice Emitted when initializeFinalization is called.
    /// @param noticeTimeoutAt The timestamp for notice timeout.
    event FinalizationInitialized(uint64 noticeTimeoutAt);

    /// @notice Emitted when the vault is finalized.
    /// @param caller The address a finalizer.
    /// @param amount0 The returned amount of the first token.
    /// @param amount1 The returned amount of the second token.
    event Finalized(address indexed caller, uint256 amount0, uint256 amount1);

    error Mammon__SameTokenAddresses(address token);
    error Mammon__ValidatorIsNotValid(address validator);
    error Mammon__NoticePeriodIsAboveMax(uint256 actual, uint256 max);
    error Mammon__CallerIsNotOwnerOrManager();
    error Mammon__NoticeTimeoutNotElapsed(uint64 noticeTimeoutAt);
    error Mammon__ManagerIsZeroAddress();
    error Mammon__CallerIsNotManager();
    error Mammon__RatioChangePerBlockIsAboveMax(uint256 actual, uint256 max);
    error Mammon__WeightIsAboveMax(uint256 actual, uint256 max);
    error Mammon__WeightIsBelowMin(uint256 actual, uint256 min);
    error Mammon__AmountIsBelowMin(uint256 actual, uint256 min);
    error Mammon__FinalizationNotInitialized();
    error Mammon__VaultNotInitialized();
    error Mammon__VaultIsAlreadyInitialized();
    error Mammon__VaultIsFinalizing();

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

    /// @notice Initializes the contract by deploying new Balancer pool by using the provided factory.
    /// @dev First token and second token shouldn't be same. Validator should be valid.
    /// @param factory_ Balancer Pool Factory address
    /// @param token0_ First token address. This is immutable, cannot be changed later
    /// @param token1_ Second token address. This is immutable, cannot be changed later
    /// @param manager_ Vault Manager address
    /// @param validator_ Withdrawal validator contract address. This is immutable, cannot be changed later
    /// @param noticePeriod_ Notice period in seconds. This is immutable, cannot be changed later
    constructor(
        address factory_,
        address token0_,
        address token1_,
        address manager_,
        address validator_,
        uint32 noticePeriod_
    ) {
        if (token0_ == token1_) {
            revert Mammon__SameTokenAddresses(token0_);
        }
        if (
            !IERC165(validator_).supportsInterface(
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

        pool = IBPool(IBFactory(factory_).newBPool());
        token0 = token0_;
        token1 = token1_;
        manager = manager_;
        validator = IWithdrawalValidator(validator_);
        noticePeriod = noticePeriod_;

        emit Created(
            factory_,
            token0_,
            token1_,
            manager_,
            validator_,
            noticePeriod_
        );
        emit ManagerChanged(UNSET_MANAGER_ADDRESS, manager_);
    }

    /// @inheritdoc IProtocolAPI
    function initialDeposit(
        uint256 amount0,
        uint256 amount1,
        uint256 weight0,
        uint256 weight1
    ) external override onlyOwner {
        if (initialized) {
            revert Mammon__VaultIsAlreadyInitialized();
        }
        initialized = true;

        uint256 poolMinWeight = pool.MIN_WEIGHT();
        if (weight0 < poolMinWeight) {
            revert Mammon__WeightIsBelowMin(weight0, poolMinWeight);
        }
        uint256 poolMaxWeight = pool.MAX_WEIGHT();
        if (weight0 > poolMaxWeight) {
            revert Mammon__WeightIsAboveMax(weight0, poolMaxWeight);
        }
        uint256 poolMinAmount = pool.MIN_BALANCE();
        if (amount0 < poolMinAmount) {
            revert Mammon__AmountIsBelowMin(amount0, poolMinAmount);
        }

        if (weight1 < poolMinWeight) {
            revert Mammon__WeightIsBelowMin(weight1, poolMinWeight);
        }
        if (weight1 > poolMaxWeight) {
            revert Mammon__WeightIsAboveMax(weight1, poolMaxWeight);
        }
        if (amount1 < poolMinAmount) {
            revert Mammon__AmountIsBelowMin(amount1, poolMinAmount);
        }

        bindToken(token0, amount0, weight0);
        bindToken(token1, amount1, weight1);

        gradualUpdate.startWeights = [weight0, weight1];

        emit Deposit(amount0, amount1, weight0, weight1);
    }

    /// @inheritdoc IProtocolAPI
    function deposit(uint256 amount0, uint256 amount1)
        external
        override
        nonReentrant
        onlyOwner
        onlyInitialized
        nonFinalizing
    {
        if (amount0 > 0) {
            depositToken(token0, amount0, holdings0());
        }
        if (amount1 > 0) {
            depositToken(token1, amount1, holdings1());
        }

        uint256 weight0 = getDenormalizedWeight(token0);
        uint256 weight1 = getDenormalizedWeight(token1);

        emit Deposit(amount0, amount1, weight0, weight1);
    }

    /// @inheritdoc IProtocolAPI
    function withdraw(uint256 amount0, uint256 amount1)
        external
        override
        nonReentrant
        onlyOwner
        onlyInitialized
        nonFinalizing
    {
        (uint256 allowance0, uint256 allowance1) = validator.allowance();

        uint256 balance0 = holdings0();
        uint256 balance1 = holdings1();

        uint256 exactAmount0 = amount0.min(balance0).min(allowance0);
        uint256 exactAmount1 = amount1.min(balance1).min(allowance1);

        uint256 withdrawnAmount0;
        uint256 withdrawnAmount1;

        if (exactAmount0 > 0) {
            withdrawnAmount0 = withdrawToken(token0, exactAmount0, balance0);
        }
        if (exactAmount1 > 0) {
            withdrawnAmount1 = withdrawToken(token1, exactAmount1, balance1);
        }

        uint256 finalWeight0 = getDenormalizedWeight(token0);
        uint256 finalWeight1 = getDenormalizedWeight(token1);

        emit Withdraw(
            amount0,
            amount1,
            withdrawnAmount0,
            withdrawnAmount1,
            allowance0,
            allowance1,
            finalWeight0,
            finalWeight1
        );
    }

    /// @inheritdoc IManagerAPI
    function updateWeightsGradually(
        uint256 targetWeight0,
        uint256 targetWeight1,
        uint256 startBlock,
        uint256 endBlock
    ) external override onlyManager onlyInitialized nonFinalizing {
        /// Library computes the startBlock,
        /// computes startWeights as the current
        /// denormalized weights of the core pool tokens.

        uint256 period = endBlock - startBlock;
        uint256 change = getWeightsChangeRatio(targetWeight0, targetWeight1);

        if (change > MAX_WEIGHT_CHANGE_RATIO_PER_BLOCK * period) {
            revert Mammon__RatioChangePerBlockIsAboveMax(
                change,
                MAX_WEIGHT_CHANGE_RATIO_PER_BLOCK
            );
        }

        uint256[] memory newWeights = new uint256[](2);
        newWeights[0] = targetWeight0;
        newWeights[1] = targetWeight1;

        SmartPoolManager.updateWeightsGradually(
            pool,
            gradualUpdate,
            newWeights,
            startBlock,
            endBlock,
            MAX_WEIGHT_CHANGE_BLOCK_PERIOD
        );

        emit UpdateWeightsGradually(
            targetWeight0,
            targetWeight1,
            startBlock,
            endBlock
        );
    }

    /// @inheritdoc IManagerAPI
    function pokeWeights()
        external
        override
        onlyManager
        onlyInitialized
        nonFinalizing
    {
        SmartPoolManager.pokeWeights(pool, gradualUpdate);
        emit PokeWeights();
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
    function finalize() external override nonReentrant onlyOwnerOrManager {
        if (noticeTimeoutAt == 0) {
            revert Mammon__FinalizationNotInitialized();
        }
        if (noticeTimeoutAt > block.timestamp) {
            revert Mammon__NoticeTimeoutNotElapsed(noticeTimeoutAt);
        }

        (uint256 amount0, uint256 amount1) = returnFunds();
        emit Finalized(msg.sender, amount0, amount1);

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
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    /// @inheritdoc IManagerAPI
    function setPublicSwap(bool value)
        external
        override
        onlyManager
        onlyInitialized
    {
        pool.setPublicSwap(value);
        emit SetPublicSwap(value);
    }

    /// @inheritdoc IManagerAPI
    function setSwapFee(uint256 newSwapFee) external override onlyManager {
        pool.setSwapFee(newSwapFee);
        emit SetSwapFee(newSwapFee);
    }

    /// @inheritdoc IUserAPI
    function isPublicSwap() external view override returns (bool) {
        return pool.isPublicSwap();
    }

    /// @inheritdoc IUserAPI
    function getSwapFee() external view override returns (uint256) {
        return pool.getSwapFee();
    }

    /// @inheritdoc IBinaryVault
    function holdings0() public view override returns (uint256) {
        return pool.getBalance(token0);
    }

    /// @inheritdoc IBinaryVault
    function holdings1() public view override returns (uint256) {
        return pool.getBalance(token1);
    }

    /// @inheritdoc IUserAPI
    function getDenormalizedWeight(address token)
        public
        view
        override
        returns (uint256)
    {
        return pool.getDenormalizedWeight(token);
    }

    /// @notice Calculate change ratio for weights upgrade.
    /// @dev Will only be called by updateWeightsGradually()
    /// @param targetWeight0 The target weight of the first token.
    /// @param targetWeight1 The target weight of the second token.
    /// @return The change ratio from current weights to target weights.
    function getWeightsChangeRatio(
        uint256 targetWeight0,
        uint256 targetWeight1
    ) internal view returns (uint256) {
        uint256 weight0 = getDenormalizedWeight(token0);
        uint256 weight1 = getDenormalizedWeight(token1);

        uint256 factor1 = weight0 * targetWeight1;
        uint256 factor2 = targetWeight0 * weight1;
        uint256 change = factor1 > factor2
            ? (ONE * factor1) / factor2
            : (ONE * factor2) / factor1;

        return change;
    }

    /// @notice Bind token to the pool.
    /// @dev Will only be called by initialDeposit().
    /// @param token The address of a token to bind.
    /// @param amount The amount of a token to bind.
    /// @param weight The weight of a token to bind.
    function bindToken(
        address token,
        uint256 amount,
        uint256 weight
    ) internal {
        /// Transfer token to this contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        /// Approve the balancer pool
        IERC20(token).safeApprove(address(pool), amount);
        /// Bind token
        pool.bind(token, amount, weight);
    }

    /// @notice Deposit token to the pool.
    /// @dev Will only be called by deposit().
    /// @param token The address of a token to deposit.
    /// @param amount The deposit amount of a token.
    /// @param balance The current balance of a token on the pool.
    function depositToken(
        address token,
        uint256 amount,
        uint256 balance
    ) internal {
        uint256 tokenDenorm = getDenormalizedWeight(token);
        uint256 newBalance = balance + amount;

        uint256 newDenorm = (tokenDenorm * newBalance) / balance;

        IERC20 erc20 = IERC20(token);

        erc20.safeTransferFrom(msg.sender, address(this), amount);
        erc20.safeApprove(address(pool), amount);

        pool.rebind(token, newBalance, newDenorm);
    }

    /// @notice Withdraw token from the pool.
    /// @dev Will only be called by withdraw()
    /// @param token The address of a token to withdraw.
    /// @param amount The withdrawal amount of a token.
    /// @param balance The current balance of a token on the pool.
    function withdrawToken(
        address token,
        uint256 amount,
        uint256 balance
    ) internal returns (uint256 withdrawAmount) {
        uint256 tokenDenorm = getDenormalizedWeight(token);

        uint256 newBalance = balance - amount;
        uint256 newDenorm = (tokenDenorm * newBalance) / balance;

        pool.rebind(token, newBalance, newDenorm);

        IERC20 erc20 = IERC20(token);
        withdrawAmount = erc20.balanceOf(address(this));
        erc20.safeTransfer(msg.sender, withdrawAmount);
    }

    /// @notice Return all funds to the owner.
    /// @dev Will only be called by finalize().
    /// @return amount0 The exact returned amount of first token.
    /// @return amount1 The exact returned amount of second token.
    function returnFunds()
        internal
        returns (uint256 amount0, uint256 amount1)
    {
        amount0 = returnTokenFunds(token0);
        amount1 = returnTokenFunds(token1);
    }

    /// @notice Return funds to the owner.
    /// @dev Will only be called by returnFunds().
    /// @param token The address of a token to unbind.
    /// @return amount The exact returned amount of a token.
    function returnTokenFunds(address token)
        internal
        returns (uint256 amount)
    {
        pool.unbind(token);

        IERC20 erc20 = IERC20(token);
        amount = erc20.balanceOf(address(this));
        erc20.safeTransfer(owner(), amount);
    }
}
