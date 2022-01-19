// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

import "./dependencies/openzeppelin/SafeERC20.sol";
import "./dependencies/openzeppelin/IERC20.sol";
import "./dependencies/openzeppelin/IERC165.sol";
import "./dependencies/openzeppelin/Ownable.sol";
import "./dependencies/openzeppelin/ReentrancyGuard.sol";
import "./dependencies/openzeppelin/Math.sol";
import "./dependencies/openzeppelin/SafeCast.sol";
import "./dependencies/openzeppelin/ERC165Checker.sol";
import "./interfaces/IBManagedPoolFactory.sol";
import "./interfaces/IBManagedPool.sol";
import "./interfaces/IMammonVaultV1.sol";
import "./interfaces/IWithdrawalValidator.sol";

/// @title Risk-managed treasury vault.
/// @notice Managed two-asset vault that supports withdrawals
///         in line with a pre-defined validator contract.
/// @dev Vault owner is the asset owner.
contract MammonVaultV1 is IMammonVaultV1, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;
    using SafeCast for uint256;

    /// STORAGE ///

    uint256 private constant ONE = 10**18;

    /// @notice Largest possible notice period for vault termination (2 months).
    uint32 private constant MAX_NOTICE_PERIOD = 60 days;

    /// @dev Address to represent unset manager in events.
    address private constant UNSET_MANAGER_ADDRESS = address(0);

    /// @notice Minimum duration (in blocks) for a weight update.
    uint256 private constant MIN_WEIGHT_CHANGE_BLOCK_PERIOD = 1000;

    /// @notice Largest possible weight change ratio per one block
    /// @dev It's the increment/decrement factor per one block
    ///      increment/decrement factor per n blocks: Fn = f * n
    ///      Spot price growth range for n blocks: [1 / Fn - 1, Fn - 1]
    ///      E.g. increment/decrement factor per 200 blocks is 2
    ///      Spot price growth range for 200 blocks is [-50%, 100%]
    uint256 private constant MAX_WEIGHT_CHANGE_RATIO_PER_BLOCK = 10**16;

    /// @notice Balancer pool. Controlled by the vault.
    IBManagedPool public immutable pool;

    /// @notice Notice period for vault termination (in seconds).
    uint32 public immutable noticePeriod;

    /// @notice Verifies withdraw limits.
    IWithdrawalValidator public immutable validator;

    /// STORAGE SLOT START ///

    /// @notice Token addresses in vault.
    IERC20[] public tokens;

    /// @notice Submits new balance parameters for the vault
    address public manager;

    /// @notice Timestamp when notice elapses or 0 if not yet set
    uint64 public noticeTimeoutAt;

    /// @notice Indicates that the Vault has been initialized
    bool public initialized;

    /// EVENTS ///

    /// @notice Emitted when the vault is created.
    /// @param factory Address of Balancer Managed Pool factory.
    /// @param tokens Address of tokens.
    /// @param weights Weights of tokens.
    /// @param manager Address of vault manager.
    /// @param validator Address of withdrawal validator contract
    /// @param noticePeriod Notice period in seconds.
    event Created(
        address indexed factory,
        IERC20[] tokens,
        uint256[] weights,
        address manager,
        address validator,
        uint32 noticePeriod
    );

    /// @notice Emitted when tokens are deposited.
    /// @param amount0 Amount of first token.
    /// @param amount1 Amount of second token.
    /// @param weight0 Aeight of first token.
    /// @param weight1 Weight of second token.
    event Deposit(
        uint256 amount0,
        uint256 amount1,
        uint256 weight0,
        uint256 weight1
    );

    /// @notice Emitted when tokens are withdrawn.
    /// @param requestedAmount0 Requested amount of first token.
    /// @param requestedAmount1 Requested amount of second token.
    /// @param withdrawnAmount0 Withdrawn amount of first token.
    /// @param withdrawnAmount1 Withdrawn amount of second token.
    /// @param allowance0 Allowance of first token.
    /// @param allowance1 Allowance of second token.
    /// @param finalWeight0 Post-withdrawal weight of first token.
    /// @param finalWeight1 Post-withdrawal weight of second token.
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

    /// @notice Emitted when manager is changed.
    /// @param previousManager Address of previous manager.
    /// @param manager Address of a new manager.
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
    /// @param noticeTimeoutAt Timestamp for notice timeout.
    event FinalizationInitialized(uint64 noticeTimeoutAt);

    /// @notice Emitted when vault is finalized.
    /// @param caller Address of finalizer.
    /// @param amount0 Returned amount of first token.
    /// @param amount1 Returned amount of second token.
    event Finalized(address indexed caller, uint256 amount0, uint256 amount1);

    /// ERRORS ///

    error Mammon__LengthIsNotSame(uint256 tokenLength, uint256 weightLength);
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
    /// @param factory_ Balancer Managed Pool Factory address.
    /// @param name Name of a Pool Token.
    /// @param symbol Symbol of a Pool Token.
    /// @param tokens_ Address of tokens.
    /// @param swapFeePercentage Swap fee of the pool.
    /// @param managementSwapFeePercentage Management swap fee of the pool.
    /// @param manager_ Vault manager address.
    /// @param validator_ Withdrawal validator contract address.
    /// @param noticePeriod_ Notice period in seconds.
    constructor(
        address factory_,
        string memory name,
        string memory symbol,
        IERC20[] memory tokens_,
        uint256[] memory weights_,
        uint256 swapFeePercentage,
        uint256 managementSwapFeePercentage,
        address manager_,
        address validator_,
        uint32 noticePeriod_
    ) {
        if (tokens_.length != weights_.length) {
            revert Mammon__LengthIsNotSame(tokens_.length, weights_.length);
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

        address[] memory managers = new address[](1);
        managers[0] = msg.sender;

        pool = IBManagedPool(
            IBManagedPoolFactory(factory_).create(
                name,
                symbol,
                tokens_,
                weights_,
                swapFeePercentage,
                msg.sender,
                false,
                managementSwapFeePercentage
            )
        );

        tokens = tokens_;
        manager = manager_;
        validator = IWithdrawalValidator(validator_);
        noticePeriod = noticePeriod_;

        emit Created(
            factory_,
            tokens_,
            weights_,
            manager_,
            validator_,
            noticePeriod_
        );
        emit ManagerChanged(UNSET_MANAGER_ADDRESS, manager_);
    }

    /// PROTOCOL API ///

    /// @inheritdoc IProtocolAPI
    function initialDeposit(
        uint256 amount0,
        uint256 amount1,
        uint256 weight0,
        uint256 weight1
    )
        external
        override
        onlyOwner // solhint-disable-next-line no-empty-blocks
    {
        // Should be implemented, updated or removed
    }

    /// @inheritdoc IProtocolAPI
    function deposit(uint256 amount0, uint256 amount1)
        external
        override
        nonReentrant
        onlyOwner
        onlyInitialized
        nonFinalizing
    // solhint-disable-next-line no-empty-blocks
    {
        // Should be implemented, updated or removed
    }

    /// @inheritdoc IProtocolAPI
    function withdraw(uint256 amount0, uint256 amount1)
        external
        override
        nonReentrant
        onlyOwner
        onlyInitialized
        nonFinalizing
    // solhint-disable-next-line no-empty-blocks
    {
        // Should be implemented, updated or removed
    }

    /// @inheritdoc IProtocolAPI
    function initializeFinalization()
        external
        override
        onlyOwner
        onlyInitialized
        nonFinalizing
    // solhint-disable-next-line no-empty-blocks
    {
        // Should be implemented, updated or removed
    }

    /// @inheritdoc IProtocolAPI
    function finalize()
        external
        override
        nonReentrant
        onlyOwnerOrManager
    // solhint-disable-next-line no-empty-blocks
    {
        // Should be implemented, updated or removed
    }

    /// @inheritdoc IProtocolAPI
    function setManager(address newManager)
        external
        override
        onlyOwner
    // solhint-disable-next-line no-empty-blocks
    {
        // Should be implemented, updated or removed
    }

    /// @inheritdoc IProtocolAPI
    function sweep(address token, uint256 amount)
        external
        override
        onlyOwner
    // solhint-disable-next-line no-empty-blocks
    {
        // Should be implemented, updated or removed
    }

    /// MANAGER API ///

    /// @inheritdoc IManagerAPI
    function updateWeightsGradually(
        uint256 targetWeight0,
        uint256 targetWeight1,
        uint256 startBlock,
        uint256 endBlock
    )
        external
        override
        onlyManager
        onlyInitialized
        nonFinalizing
    // solhint-disable-next-line no-empty-blocks
    {
        // Should be implemented, updated or removed
    }

    /// @inheritdoc IManagerAPI
    function pokeWeights()
        external
        override
        onlyManager
        onlyInitialized
        nonFinalizing
    // solhint-disable-next-line no-empty-blocks
    {
        // Should be implemented, updated or removed
    }

    /// @inheritdoc IManagerAPI
    function setPublicSwap(bool value)
        external
        override
        onlyManager
        onlyInitialized
    // solhint-disable-next-line no-empty-blocks
    {
        // Should be implemented, updated or removed
    }

    /// @inheritdoc IManagerAPI
    function setSwapFee(uint256 newSwapFee)
        external
        override
        onlyManager
    // solhint-disable-next-line no-empty-blocks
    {
        // Should be implemented, updated or removed
    }

    /// BINARY VAULT INTERFACE ///

    /// @inheritdoc IBinaryVault
    function holdings0()
        public
        view
        override
        returns (uint256)
    // solhint-disable-next-line no-empty-blocks
    {
        // Should be implemented, updated or removed
    }

    /// @inheritdoc IBinaryVault
    function holdings1()
        public
        view
        override
        returns (uint256)
    // solhint-disable-next-line no-empty-blocks
    {
        // Should be implemented, updated or removed
    }

    /// USER API ///

    /// @inheritdoc IUserAPI
    function isPublicSwap()
        external
        view
        override
        returns (bool)
    // solhint-disable-next-line no-empty-blocks
    {
        // Should be implemented, updated or removed
    }

    /// @inheritdoc IUserAPI
    function getSwapFee()
        external
        view
        override
        returns (uint256)
    // solhint-disable-next-line no-empty-blocks
    {
        // Should be implemented, updated or removed
    }

    /// @inheritdoc IUserAPI
    function getDenormalizedWeight(address token)
        public
        view
        override
        returns (uint256)
    // solhint-disable-next-line no-empty-blocks
    {
        // Should be implemented, updated or removed
    }

    /// @notice Calculate change ratio for weights upgrade.
    /// @dev Will only be called by updateWeightsGradually().
    /// @param targetWeight0 Target weight of first token.
    /// @param targetWeight1 Target weight of second token.
    /// @return Change ratio from current weights to target weights.
    function getWeightsChangeRatio(
        uint256 targetWeight0,
        uint256 targetWeight1
    )
        public
        view
        returns (uint256)
    // solhint-disable-next-line no-empty-blocks
    {
        // Should be implemented, updated or removed
    }

    /// INTERNAL FUNCTIONS ///

    /// @notice Bind token to the pool.
    /// @dev Will only be called by initialDeposit().
    /// @param token Address of a token to bind.
    /// @param amount Amount of a token to bind.
    /// @param weight Weight of a token to bind.
    function bindToken(
        address token,
        uint256 amount,
        uint256 weight // solhint-disable-next-line no-empty-blocks
    ) internal {
        // Should be implemented, updated or removed
    }

    /// @notice Deposit token to the pool.
    /// @dev Will only be called by deposit().
    /// @param token Address of the token to deposit.
    /// @param amount Amount to deposit.
    /// @param balance Current balance of the token in the pool.
    function depositToken(
        address token,
        uint256 amount,
        uint256 balance // solhint-disable-next-line no-empty-blocks
    ) internal {
        // Should be implemented, updated or removed
    }

    /// @notice Withdraw token from the pool.
    /// @dev Will only be called by withdraw().
    /// @param token Address of the token to withdraw.
    /// @param amount Amount to withdraw.
    /// @param balance The current balance of the token in the pool.
    function withdrawToken(
        address token,
        uint256 amount,
        uint256 balance
    )
        internal
        returns (uint256 withdrawAmount)
    // solhint-disable-next-line no-empty-blocks
    {
        // Should be implemented, updated or removed
    }

    /// @notice Return all funds to owner.
    /// @dev Will only be called by finalize().
    /// @return amount0 Exact returned amount of first token.
    /// @return amount1 Exact returned amount of second token.
    function returnFunds()
        internal
        returns (uint256 amount0, uint256 amount1)
    // solhint-disable-next-line no-empty-blocks
    {
        // Should be implemented, updated or removed
    }

    /// @notice Return funds to owner.
    /// @dev Will only be called by returnFunds().
    /// @param token Address of the token to unbind.
    /// @return amount The exact returned amount of a token.
    function returnTokenFunds(address token)
        internal
        returns (uint256 amount)
    // solhint-disable-next-line no-empty-blocks
    {
        // Should be implemented, updated or removed
    }
}
