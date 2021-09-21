// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "./interfaces/IBFactory.sol";
import "./interfaces/IBPool.sol";
import { SafeERC20, IERC20 as ISafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "https://github.com/balancer-labs/configurable-rights-pool/blob/master/libraries/SmartPoolManager.sol";

contract MammonBalancerPrivatePoolVault is Ownable {
    using SafeERC20 for ISafeERC20;

    uint256 private constant ONE = 10**18;
    uint256 private constant MIN_CONVERGENCE_SPEED = 10**12;
    uint256 private constant BASE_WEIGHT = ONE * 5;

    IBFactory private bFactory;
    IBPool private bPool;

    bool private initialized;
    address public immutable token0;
    address public immutable token1;
    uint256 private convergenceSpeed;
    uint256 private targetShare2;
    SmartPoolManager.GradualUpdateParams private gradualUpdate;

    constructor (address _factory, address _token0, address _token1) {
        bFactory = IBFactory(_factory);
        bPool = bFactory.newBPool();
        token0 = _token0;
        token1 = _token1;
    }

    function init(
        uint256[] calldata amounts,
        uint256[] calldata weights
    )
        external
        onlyOwner
    {
        require (!initialized, "already initialized");
        require (amounts.length == 2, "need amounts for two tokens");
        require (weights.length == 2, "need weights for two tokens");

        // Transfer token0 to this contract
        ISafeERC20(token0).safeTransferFrom(msg.sender, address(this), amounts[0]);
        // Approve the balancer pool
        ISafeERC20(token0).safeApprove(address(bPool), type(uint256).max);
        // Bind token0
        bPool.bind(token0, amounts[0], weights[0]);

        // Transfer token1 to this contract
        ISafeERC20(token1).safeTransferFrom(msg.sender, address(this), amounts[1]);
        // Approve the balancer pool
        ISafeERC20(token1).safeApprove(address(bPool), type(uint256).max);
        // Bind token1
        bPool.bind(token1, amounts[1], weights[1]);

        gradualUpdate.startWeights = weights;
        initialized = true;
    }

    function deposit(uint256[] calldata amounts) external onlyOwner {
        // Deposit each amount of tokens
        require (amounts.length == 2, "need amounts for two tokens");

        address[2] memory tokens = [token0, token1];

        for (uint256 i = 0; i < tokens.length; i++) {
            ISafeERC20 token = ISafeERC20(tokens[i]);
            uint256 tokenBalance = getBalance(tokens[i]);
            uint256 tokenDenorm = getDenormalizedWeight(tokens[i]);

            uint256 newBalance = tokenBalance + amounts[i];
            uint256 newDenorm = tokenDenorm * newBalance / tokenBalance;

            if (newBalance > tokenBalance) {
                uint256 needBalance = newBalance - tokenBalance;
                token.safeTransferFrom(msg.sender, address(this), needBalance);
            }

            token.safeApprove(address(bPool), type(uint256).max);

            bPool.rebind(tokens[i], newBalance, newDenorm);
        }
    }

    function withdraw(uint256[] calldata amounts) external onlyOwner {
        // Withdraw as much as possible up to each amount of tokens
        require (amounts.length == 2, "need amounts for two tokens");

        address[2] memory tokens = [token0, token1];

        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 tokenBalance = getBalance(tokens[i]);
            uint256 tokenDenorm = getDenormalizedWeight(tokens[i]);

            require (tokenBalance >= amounts[i], "low balance");

            uint256 newBalance = tokenBalance - amounts[i];
            uint256 newDenorm = tokenDenorm * newBalance / tokenBalance;

            bPool.rebind(tokens[i], newBalance, newDenorm);

            ISafeERC20 token = ISafeERC20(tokens[i]);
            token.safeTransfer(msg.sender, token.balanceOf(address(this)));
        }
    }

    function gulp(address token) external onlyOwner {
        bPool.gulp(token);
    }

    function updateWeightsGradually(uint256[] memory newWeights)
        public
        onlyOwner
    {
        // Library computes the startBlock,
        // computes startWeights as the current
        // denormalized weights of the core pool tokens.
        require (newWeights.length == 2, "need new weights for two tokens");

        uint256 endBlock = getExpectedFinalBlock();

        SmartPoolManager.updateWeightsGradually(
            bPool,
            gradualUpdate,
            newWeights,
            block.number,
            endBlock,
            0
        );
    }

    function pokeWeights() external onlyOwner {
        SmartPoolManager.pokeWeights(bPool, gradualUpdate);
    }

    function setTargetShare2(uint256 newTargetShare2) external onlyOwner {
        // Set target share for token2 and call updateWeightsGradually
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
        bPool.setPublicSwap(value);
    }

    function setSwapFee(uint256 newSwapFee) external onlyOwner {
        bPool.setSwapFee(newSwapFee);
    }

    function isInitialized() external view returns (bool) {
        return initialized;
    }

    function isPublicSwap() external view returns (bool) {
        return bPool.isPublicSwap();
    }

    function BFactory() external view returns (IBFactory) {
        return bFactory;
    }

    function BPool() external view returns (IBPool) {
        return bPool;
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
        return bPool.getSwapFee();
    }

    function getExpectedFinalBlock() public view returns (uint256) {
        return block.number + ONE / convergenceSpeed;
    }

    function getSpotPrice(address tokenIn, address tokenOut)
        external
        view
        returns (uint256)
    {
        return bPool.getSpotPrice(tokenIn, tokenOut);
    }

    function getSpotPriceSansFee(address tokenIn, address tokenOut)
        external
        view
        returns (uint256)
    {
        return bPool.getSpotPriceSansFee(tokenIn, tokenOut);
    }

    function getBalance(address token) public view returns (uint256) {
        return bPool.getBalance(token);
    }

    function getDenormalizedWeight(address token) public view returns (uint256) {
        return bPool.getDenormalizedWeight(token);
    }

    function totalSupply() external view returns (uint256) {
        return bPool.totalSupply();
    }
}