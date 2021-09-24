// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7;

import "./dependencies/openzeppelin/SafeERC20.sol";
import "./dependencies/openzeppelin/IERC20.sol";
import "./dependencies/openzeppelin/Ownable.sol";
import "./dependencies/openzeppelin/ReentrancyGuard.sol";
import "./dependencies/openzeppelin/Math.sol";
import "./interfaces/IBFactory.sol";
import "./interfaces/IBPool.sol";
import "./interfaces/IMammonVaultV0.sol";
import "./interfaces/IManagerAPI.sol";
import "./interfaces/IWithdrawalValidator.sol";
import "./libraries/SmartPoolManager.sol";

/**
 * @dev Represents a treasury vault that is managed by Mammon.
 * Owner is original asset owner that can add and withdraw funds.
 */
contract MammonVaultV0 is
    IMammonVaultV0,
    IManagerAPI,
    Ownable,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;
    using Math for uint256;

    IBPool public immutable pool;
    address public immutable token0;
    address public immutable token1;
    IWithdrawalValidator public immutable validator;
    // slot start
    /**
     * @dev Submits new balance parameters for the vault
     */
    address public manager;

    /**
     * @dev Timestamp when notice elapses or 0 if not yet set
     */
    uint56 public noticeTimeoutAt;

    /**
     * @dev Notice period for vault termination (in seconds)
     */
    uint32 public noticePeriod;

    /**
     * @dev Indicates that the Vault has been initialized.
     */
    bool public initialized;
    // slot end

    SmartPoolManager.GradualUpdateParams private gradualUpdate;

    event Deposit(
        uint256 amount0,
        uint256 amount1,
        uint256 weight0,
        uint256 weight1
    );

    event Withdraw(
        uint256 amount0,
        uint256 amount1,
        uint256 weight0,
        uint256 weight1
    );

    event ManagerChanged(
        address indexed previousManager,
        address indexed manager
    );

    event FinalizationInitialized(uint56 noticeTimeoutAt);
    event Finalized();

    error CallerIsNotOwnerOrManager();
    error NoticeTimeoutNotElapsed(uint56 noticeTimeoutAt);
    error ManagerIsZeroAddress();
    error CallerIsNotManager();
    error DepositAmountIsZero();
    error WeightIsAboveMax(uint256 weight);
    error WeightIsBelowMin(uint256 weight);
    error AmountIsBelowMin(uint256 amount);
    error FinalizationNotInitialized();
    error VaultNotInitialized();
    error VaultIsAlreadyInitialized();
    error VaultIsFinalizing();

    modifier onlyManager() {
        if (msg.sender != manager) {
            revert CallerIsNotManager();
        }
        _;
    }

    modifier onlyInitialized() {
        if (!initialized) {
            revert VaultNotInitialized();
        }
        _;
    }

    modifier nonFinalizing() {
        if (noticeTimeoutAt != 0) {
            revert VaultIsFinalizing();
        }
        _;
    }

    constructor(
        address _factory,
        address _token0,
        address _token1,
        address _manager,
        address _validator,
        uint32 _noticePeriod
    ) {
        pool = IBPool(IBFactory(_factory).newBPool());
        token0 = _token0;
        token1 = _token1;
        manager = _manager;
        noticePeriod = _noticePeriod;
        validator = IWithdrawalValidator(_validator);
        emit ManagerChanged(address(0), _manager);
    }

    /**
     * @dev Initializes the Vault. Vault initialization must be performed before
     * calling withdraw() or deposit() functions. Available only to the owner.
     */
    function initialDeposit(
        uint256 amount0,
        uint256 amount1,
        uint256 weight0,
        uint256 weight1
    ) external override onlyOwner {
        if (initialized) {
            revert VaultIsAlreadyInitialized();
        }
        if (weight0 < pool.MIN_WEIGHT()) {
            revert WeightIsBelowMin(weight0);
        }
        if (weight0 > pool.MAX_WEIGHT()) {
            revert WeightIsAboveMax(weight0);
        }
        if (amount0 < pool.MIN_BALANCE()) {
            revert AmountIsBelowMin(amount0);
        }

        if (weight1 < pool.MIN_WEIGHT()) {
            revert WeightIsBelowMin(weight1);
        }
        if (weight1 > pool.MAX_WEIGHT()) {
            revert WeightIsAboveMax(weight1);
        }
        if (amount1 < pool.MIN_BALANCE()) {
            revert AmountIsBelowMin(amount1);
        }
        initialized = true;

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
        onlyOwner
        onlyInitialized
        nonReentrant
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
        onlyOwner
        onlyInitialized
        nonReentrant
        nonFinalizing
    {
        (uint256 allowance0, uint256 allowance1) = validator.allowance();

        if (amount0 > 0) {
            withdrawToken(token0, amount0, holdings0(), allowance0);
        }
        if (amount1 > 0) {
            withdrawToken(token1, amount1, holdings1(), allowance1);
        }

        uint256 weight0 = getDenormalizedWeight(token0);
        uint256 weight1 = getDenormalizedWeight(token1);

        emit Withdraw(amount0, amount1, weight0, weight1);
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
            0
        );
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
    }

    /**
     * @dev Initiate vault destruction and return all funds to treasury owner.
     * This is practically irreversible. Available only if the vault is initialized
     */
    function initializeFinalization()
        external
        override
        onlyOwner
        onlyInitialized
    {
        noticeTimeoutAt = uint56(block.timestamp) + noticePeriod;
        emit FinalizationInitialized(noticeTimeoutAt);
    }

    /**
     * @dev Destroys vault and returns all funds to treasury owner. Only possible
     *  if `noticePeriod` is set to 0 or `initiateFinalization` has been
     *  called at least `noticePeriod` seconds before current timestamp.
     *  Also could be called by manager in the event of an emergency
     *  (e.g., funds at risk).
     */
    function finalize() external override {
        if (msg.sender != owner() && msg.sender != manager) {
            revert CallerIsNotOwnerOrManager();
        }
        if (noticeTimeoutAt == 0) {
            revert FinalizationNotInitialized();
        }
        if (noticeTimeoutAt > block.timestamp) {
            revert NoticeTimeoutNotElapsed(noticeTimeoutAt);
        }
        returnFunds();
        emit Finalized();

        selfdestruct(payable(owner()));
    }

    /**
     * @dev Changes manager. Only available to the owner.
     */
    function setManager(address newManager) external override onlyOwner {
        if (newManager == address(0)) {
            revert ManagerIsZeroAddress();
        }
        emit ManagerChanged(manager, newManager);
        manager = newManager;
    }

    function setPublicSwap(bool value) external override onlyManager {
        pool.setPublicSwap(value);
    }

    function setSwapFee(uint256 newSwapFee) external override onlyManager {
        pool.setSwapFee(newSwapFee);
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
        address _token,
        uint256 _amount,
        uint256 _balance
    ) internal {
        if (_amount == 0) {
            revert DepositAmountIsZero();
        }

        uint256 tokenDenorm = getDenormalizedWeight(_token);
        uint256 newBalance = _balance + _amount;

        uint256 newDenorm = (tokenDenorm * newBalance) / _balance;

        IERC20 token = IERC20(_token);

        token.safeTransferFrom(msg.sender, address(this), _amount);
        token.safeApprove(address(pool), _amount);

        pool.rebind(_token, newBalance, newDenorm);
    }

    function withdrawToken(
        address _token,
        uint256 _amount,
        uint256 _balance,
        uint256 _allowance
    ) internal {
        uint256 tokenDenorm = getDenormalizedWeight(_token);

        uint256 delta = _amount.min(_balance).min(_allowance);

        uint256 newBalance = _balance - delta;
        uint256 newDenorm = (tokenDenorm * newBalance) / _balance;

        pool.rebind(_token, newBalance, newDenorm);

        IERC20 token = IERC20(_token);
        token.safeTransfer(msg.sender, token.balanceOf(address(this)));
    }

    /**
     * @dev Return all funds to owner. Will only be called by finalize()
     */
    function returnFunds() internal {
        returnTokenFunds(token0);
        returnTokenFunds(token1);
    }

    function returnTokenFunds(address token) internal {
        pool.unbind(token);

        IERC20 erc20 = IERC20(token);
        erc20.safeTransfer(owner(), erc20.balanceOf(address(this)));
    }
}
