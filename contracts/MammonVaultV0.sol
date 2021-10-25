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
import "./interfaces/IManagerAPI.sol";
import "./interfaces/IWithdrawalValidator.sol";
import "./libraries/SmartPoolManager.sol";

/**
 * @dev Represents a treasury vault that is managed by Mammon.
 * Owner is original asset owner that can add and withdraw funds.
 * This code is not audited or tested. Please do not use in production.
 */
contract MammonVaultV0 is
    IMammonVaultV0,
    IManagerAPI,
    Ownable,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;
    using Math for uint256;
    using SafeCast for uint256;

    /**
     * @dev Maximum notice period for vault termination (2 months).
     */
    uint32 public constant MAX_NOTICE_PERIOD = 60 days;

    /**
     * @dev Balancer pool. Owned by the vault.
     */
    IBPool public immutable pool;
    /**
     * @dev First token address in vault
     */
    address public immutable token0;

    /**
     * @dev Second token address in vault
     */
    address public immutable token1;

    /**
     * @dev Notice period for vault termination (in seconds).
     */
    uint32 public immutable noticePeriod;

    /**
     * @dev Verifies withdraw limits
     */
    IWithdrawalValidator public immutable validator;
    // slot start

    /**
     * @dev Submits new balance parameters for the vault
     */
    address public manager;

    /**
     * @dev Timestamp when notice elapses or 0 if not yet set
     */
    uint64 public noticeTimeoutAt;

    /**
     * @dev Indicates that the Vault has been initialized.
     */
    bool public initialized;
    // slot end, 3 bytes left

    SmartPoolManager.GradualUpdateParams private gradualUpdate;

    address private constant UNSET_MANAGER_ADDRESS = address(0);
    uint256 private constant MINIMUM_WEIGHT_CHANGE_BLOCK_PERIOD = 1000;

    event Created(
        address indexed factory,
        address indexed token0,
        address indexed token1,
        address manager,
        address validator,
        uint32 noticePeriod
    );

    event Deposit(
        uint256 amount0,
        uint256 amount1,
        uint256 weight0,
        uint256 weight1
    );

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

    event ManagerChanged(
        address indexed previousManager,
        address indexed manager
    );

    event UpdateWeightsGradually(
        uint256 weight0,
        uint256 weight1,
        uint256 startBlock,
        uint256 endBlock
    );

    event PokeWeights();

    event SetPublicSwap(bool publicSwap);
    event SetSwapFee(uint256 swapFee);

    event FinalizationInitialized(uint64 noticeTimeoutAt);
    event Finalized(address indexed caller, uint256 amount0, uint256 amount1);

    error Mammon__SameTokenAddresses(address token);
    error Mammon__ValidatorIsNotValid(address validator);
    error Mammon__NoticePeriodIsAboveMax(uint256 actual, uint256 max);
    error Mammon__CallerIsNotOwnerOrManager();
    error Mammon__NoticeTimeoutNotElapsed(uint64 noticeTimeoutAt);
    error Mammon__ManagerIsZeroAddress();
    error Mammon__CallerIsNotManager();
    error Mammon__WeightIsAboveMax(uint256 actual, uint256 max);
    error Mammon__WeightIsBelowMin(uint256 actual, uint256 min);
    error Mammon__AmountIsBelowMin(uint256 actual, uint256 min);
    error Mammon__FinalizationNotInitialized();
    error Mammon__VaultNotInitialized();
    error Mammon__VaultIsAlreadyInitialized();
    error Mammon__VaultIsFinalizing();

    modifier onlyManager() {
        if (msg.sender != manager) {
            revert Mammon__CallerIsNotManager();
        }
        _;
    }

    modifier onlyOwnerOrManager() {
        if (msg.sender != owner() && msg.sender != manager) {
            revert Mammon__CallerIsNotOwnerOrManager();
        }
        _;
    }

    modifier onlyInitialized() {
        if (!initialized) {
            revert Mammon__VaultNotInitialized();
        }
        _;
    }

    modifier nonFinalizing() {
        if (noticeTimeoutAt != 0) {
            revert Mammon__VaultIsFinalizing();
        }
        _;
    }

    /// @dev Initializes the contract by deploying new Balancer pool by using the provided factory.
    /// @param factory_ - Balancer Pool Factory address
    /// @param token0_ - First token address. This is immutable, cannot be changed later
    /// @param token1_ - Second token address. This is immutable, cannot be changed later
    /// @param manager_ - Vault Manager address
    /// @param validator_ - Withdrawal validator contract address. This is immutable, cannot be changed later
    /// @param noticePeriod_ - Notice period in seconds. This is immutable, cannot be changed later
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
        if (_noticePeriod > MAX_NOTICE_PERIOD) {
            revert Mammon__NoticePeriodIsAboveMax(_noticePeriod, MAX_NOTICE_PERIOD);
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

    /**
     * @dev Initializes the Vault. Vault initialization must be performed before
     *      calling withdraw() or deposit() functions. Available only to the owner.
     */
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

    /**
     * @dev Deposit `amounts` of tokens.
     */
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

    /**
     * @dev Withdraw as much as possible up to each `amount`s of `token`s.
     */
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

    /**
     * @dev  Update weights in a predetermined way, between startBlock and endBlock,
     *       through external cals to pokeWeights
     */
    function updateWeightsGradually(
        uint256 weight0,
        uint256 weight1,
        uint256 startBlock,
        uint256 endBlock
    ) external override onlyManager onlyInitialized nonFinalizing {
        /// Library computes the startBlock,
        /// computes startWeights as the current
        /// denormalized weights of the core pool tokens.

        uint256[] memory newWeights = new uint256[](2);
        newWeights[0] = weight0;
        newWeights[1] = weight1;

        SmartPoolManager.updateWeightsGradually(
            pool,
            gradualUpdate,
            newWeights,
            startBlock,
            endBlock,
            MINIMUM_WEIGHT_CHANGE_BLOCK_PERIOD
        );

        emit UpdateWeightsGradually(weight0, weight1, startBlock, endBlock);
    }

    /**
     * @dev Update weights according to plan
     */
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

    /**
     * @dev Initiate vault destruction and return all funds to treasury owner.
     *      This is practically irreversible. Available only if the vault is initialized
     */
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

    /**
     * @dev Destroys vault and returns all funds to treasury owner. Only possible
     *      if `noticePeriod` is set to 0 or `initiateFinalization` has been
     *      called at least `noticePeriod` seconds before current timestamp.
     *      Also could be called by manager in the event of an emergency
     *      (e.g., funds at risk).
     */
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

    /**
     * @dev Changes manager. Only available to the owner.
     */
    function setManager(address newManager) external override onlyOwner {
        if (newManager == address(0)) {
            revert Mammon__ManagerIsZeroAddress();
        }
        emit ManagerChanged(manager, newManager);
        manager = newManager;
    }

    function sweep(address token, uint256 amount) external override onlyOwner {
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    function setPublicSwap(bool value)
        external
        override
        onlyManager
        onlyInitialized
    {
        pool.setPublicSwap(value);
        emit SetPublicSwap(value);
    }

    function setSwapFee(uint256 newSwapFee) external override onlyManager {
        pool.setSwapFee(newSwapFee);
        emit SetSwapFee(newSwapFee);
    }

    function isPublicSwap() external view override returns (bool) {
        return pool.isPublicSwap();
    }

    function getSwapFee() external view override returns (uint256) {
        return pool.getSwapFee();
    }

    function holdings0() public view override returns (uint256) {
        return pool.getBalance(token0);
    }

    function holdings1() public view override returns (uint256) {
        return pool.getBalance(token1);
    }

    function getDenormalizedWeight(address token)
        public
        view
        override
        returns (uint256)
    {
        return pool.getDenormalizedWeight(token);
    }

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
        token.safeTransfer(msg.sender, withdrawAmount);
    }

    /**
     * @dev Return all funds to owner. Will only be called by finalize()
     */
    function returnFunds()
        internal
        returns (uint256 amount0, uint256 amount1)
    {
        amount0 = returnTokenFunds(token0);
        amount1 = returnTokenFunds(token1);
    }

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
