// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7;

import "./interfaces/IBFactory.sol";
import "./interfaces/IBPool.sol";
import { SafeERC20, IERC20 as ISafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "https://github.com/balancer-labs/configurable-rights-pool/blob/master/libraries/SmartPoolManager.sol";

contract MammonVaultV0 is IProtocolAPI, Ownable {
    using SafeERC20 for ISafeERC20;

    uint256 private constant ONE = 10**18;
    uint256 private constant MIN_CONVERGENCE_SPEED = 10**12;
    uint256 private constant BASE_WEIGHT = ONE * 5;

    IBFactory private factory;
    IBPool private pool;

    bool private initialized;
    address public immutable token0;
    address public immutable token1;
    uint256 private convergenceSpeed;
    uint256 private targetShare2;
    SmartPoolManager.GradualUpdateParams private gradualUpdate;

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
        onlyOwner
    {
        require (!initialized, "already initialized");

        bindToken(token0, amount0, amount0);
        bindToken(token1, amount1, amount1);

        gradualUpdate.startWeights = [weight0, weight1];
        initialized = true;
    }

    function deposit(uint256 amount0, uint256 amount1) external override onlyOwner {
        /// Deposit each amount of tokens

        if (amount0 > 0) {
            depositToken(token0, amount0);
        }
        if (amount1 > 0) {
            depositToken(token1, amount1);
        }
    }

    function withdraw(uint256 amount0, uint256 amount1) external override onlyOwner {
        /// Withdraw as much as possible up to each amount of tokens

        if (amount0 > 0) {
            withdrawToken(token0, amount0);
        }
        if (amount1 > 0) {
            withdrawToken(token1, amount1);
        }
    }

    function gulp(address token) external onlyOwner {
        pool.gulp(token);
    }

    function updateWeightsGradually(uint256[] memory newWeights)
        public
        onlyOwner
    {
        /// Library computes the startBlock,
        /// computes startWeights as the current
        /// denormalized weights of the core pool tokens.
        require (newWeights.length == 2, "need new weights for two tokens");

        uint256 endBlock = getExpectedFinalBlock();

        SmartPoolManager.updateWeightsGradually(
            pool,
            gradualUpdate,
            newWeights,
            block.number,
            endBlock,
            0
        );
    }

    function pokeWeights() external onlyOwner {
        SmartPoolManager.pokeWeights(pool, gradualUpdate);
    }

    function finalize() external override onlyOwner {
        pool.finalize();
    }

    function setTargetShare2(uint256 newTargetShare2) external onlyOwner {
        /// Set target share for token2 and call updateWeightsGradually
        require (
            newTargetShare2 <= ONE,
            "targetShare2 mustn't be greater than 1"
        );

        uint256 w1;
        uint256 w2;

        if (newTargetShare2 == ONE) {
            w2 = BASE_WEIGHT;
        } else if (newTargetShare2 == 0) {
            w1 = BASE_WEIGHT;
        } else {
            w1 = BASE_WEIGHT;
            w2 = w1 * newTargetShare2 / (ONE - newTargetShare2);
        }

        targetShare2 = newTargetShare2;

        uint256[] memory newWeights = new uint256[](2);
        newWeights[0] = w1;
        newWeights[1] = w2;

        updateWeightsGradually(newWeights);
    }

    function setConvergenceSpeed(uint256 newSpeed) external onlyOwner {
        convergenceSpeed = newSpeed;
    }

    function setPublicSwap(bool value) external onlyOwner {
        pool.setPublicSwap(value);
    }

    function setSwapFee(uint256 newSwapFee) external onlyOwner {
        pool.setSwapFee(newSwapFee);
    }

    function isInitialized() external view returns (bool) {
        return initialized;
    }

    function isPublicSwap() external view returns (bool) {
        return pool.isPublicSwap();
    }

    function BFactory() external view returns (IBFactory) {
        return factory;
    }

    function BPool() external view returns (IBPool) {
        return pool;
    }

    function getCurrentShare2() external view returns (uint256) {
        uint256 w1 = getDenormalizedWeight(token0);
        uint256 w2 = getDenormalizedWeight(token1);

        return w2 * ONE / (w1 + w2);
    }

    function getConvergenceSpeed() external view returns (uint256) {
        return convergenceSpeed;
    }

    function getSwapFee() external view returns (uint256) {
        return pool.getSwapFee();
    }

    function getExpectedFinalBlock() public view returns (uint256) {
        return block.number + ONE / convergenceSpeed;
    }

    function getSpotPrice(address tokenIn, address tokenOut)
        external
        view
        returns (uint256)
    {
        return pool.getSpotPrice(tokenIn, tokenOut);
    }

    function getSpotPriceSansFee(address tokenIn, address tokenOut)
        external
        view
        returns (uint256)
    {
        return pool.getSpotPriceSansFee(tokenIn, tokenOut);
    }

    function getBalance(address token) public view returns (uint256) {
        return pool.getBalance(token);
    }

    function getDenormalizedWeight(address token) public view returns (uint256) {
        return pool.getDenormalizedWeight(token);
    }

    function totalSupply() external view returns (uint256) {
        return pool.totalSupply();
    }

    function bindToken(address token, uint256 amount, uint256 weight) internal {
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