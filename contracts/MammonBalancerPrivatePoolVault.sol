// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7;

import "./interfaces/IBFactory.sol";
import "./interfaces/IBPool.sol";
import "./interfaces/IMammonVaultV0.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { SafeERC20, IERC20 as ISafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "https://github.com/balancer-labs/configurable-rights-pool/blob/master/libraries/SmartPoolManager.sol";

contract MammonVaultV0 is IMammonVaultV0, Ownable, ReentrancyGuard {
    using SafeERC20 for ISafeERC20;

    uint256 private constant ONE = 10**18;
    uint256 private constant MIN_CONVERGENCE_SPEED = 10**12;
    uint256 private constant BASE_WEIGHT = ONE * 5;

    IBFactory public factory;
    IBPool public pool;

    bool private initialized;
    address public manager;
    address public immutable token0;
    address public immutable token1;
    uint256 private targetShare2;
    SmartPoolManager.GradualUpdateParams private gradualUpdate;

    event DEPOSIT(
        address indexed caller,
        uint256 amount0,
        uint256 amount1,
        uint256 weight0,
        uint256 weight1
    );

    event WITHDRAW(
        address indexed caller,
        uint256 amount0,
        uint256 amount1,
        uint256 weight0,
        uint256 weight1
    );

    modifier onlyManager() {
        require(msg.sender == manager, "caller is not the manager");
        _;
    }

    constructor (address _factory, address _token0, address _token1) {
        factory = IBFactory(_factory);
        pool = factory.newBPool();
        token0 = _token0;
        token1 = _token1;
    }

    function initialDeposit(
        uint256 amount0,
        uint256 amount1,
        uint256 weight0,
        uint256 weight1
    )
        external
        override
        onlyOwner
    {
        require(!initialized, "already initialized");

        require(weight0 >= pool.MIN_WEIGHT(), "weight is less than min");
        require(weight0 <= pool.MAX_WEIGHT(), "weight is greater than max");
        require(amount0 >= pool.MIN_BALANCE(), "amount is less than min");
    
        require(weight1 >= pool.MIN_WEIGHT(), "weight is less than min");
        require(weight1 <= pool.MAX_WEIGHT(), "weight is greater than max");
        require(amount1 >= pool.MIN_BALANCE(), "amount is less than min");

        bindToken(token0, amount0, weight0);
        bindToken(token1, amount1, weight1);

        gradualUpdate.startWeights = [weight0, weight1];
        initialized = true;

        emit DEPOSIT(msg.sender, amount0, amount1, weight0, weight1);
    }

    function deposit(uint256 amount0, uint256 amount1)
        external
        override
        onlyOwner
        nonReentrant
    {
        /// Deposit each amount of tokens
        require (initialized, "must be initialized");

        if (amount0 > 0) {
            depositToken(token0, amount0);
        }
        if (amount1 > 0) {
            depositToken(token1, amount1);
        }

        uint256 weight0 = getDenormalizedWeight(token0);
        uint256 weight1 = getDenormalizedWeight(token1);

        emit DEPOSIT(msg.sender, amount0, amount1, weight0, weight1);
    }

    function withdraw(uint256 amount0, uint256 amount1)
        external
        override
        onlyOwner
        nonReentrant
    {
        /// Withdraw as much as possible up to each amount of tokens
        require (initialized, "must be initialized");

        if (amount0 > 0) {
            withdrawToken(token0, amount0);
        }
        if (amount1 > 0) {
            withdrawToken(token1, amount1);
        }

        uint256 weight0 = getDenormalizedWeight(token0);
        uint256 weight1 = getDenormalizedWeight(token1);

        emit WITHDRAW(msg.sender, amount0, amount1, weight0, weight1);
    }

    function gulp(address token) external override onlyOwner {
        pool.gulp(token);
    }

    function updateWeightsGradually(
        uint256 weight0,
        uint256 weight1,
        uint256 startBlock,
        uint256 endBlock
    )
        public
        override
        onlyManager
    {
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

    function pokeWeights() external override onlyManager {
        SmartPoolManager.pokeWeights(pool, gradualUpdate);
    }

    function finalize() external override onlyOwner {
        pool.finalize();
    }

    function setPublicSwap(bool value) external override onlyOwner {
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

    function getBalance(address token) public view override returns (uint256) {
        return pool.getBalance(token);
    }

    function getDenormalizedWeight(address token)
        public
        view
        override
        returns (uint256)
    {
        return pool.getDenormalizedWeight(token);
    }

    function bindToken(address token, uint256 amount, uint256 weight)
        internal
    {
        /// Transfer token to this contract
        ISafeERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        /// Approve the balancer pool
        ISafeERC20(token).safeApprove(address(pool), amount);
        /// Bind token
        pool.bind(token, amount, weight);
    }

    function depositToken(address _token, uint256 _amount) internal {
        require (_amount > 0, "deposit amount must greater than 0");

        uint256 tokenBalance = getBalance(_token);
        uint256 tokenDenorm = getDenormalizedWeight(_token);
        uint256 newBalance = tokenBalance + _amount;

        uint256 newDenorm = tokenDenorm * newBalance / tokenBalance;

        ISafeERC20 token = ISafeERC20(_token);

        token.safeTransferFrom(msg.sender, address(this), _amount);
        token.safeApprove(address(pool), _amount);

        pool.rebind(_token, newBalance, newDenorm);
    }
    
    function withdrawToken(address _token, uint256 _amount) internal {
        uint256 tokenBalance = getBalance(_token);
        uint256 tokenDenorm = getDenormalizedWeight(_token);

        require (tokenBalance >= _amount, "low balance");

        uint256 newBalance = tokenBalance - _amount;
        uint256 newDenorm = tokenDenorm * newBalance / tokenBalance;

        pool.rebind(_token, newBalance, newDenorm);

        ISafeERC20 token = ISafeERC20(_token);
        token.safeTransfer(msg.sender, token.balanceOf(address(this)));
    }
}
