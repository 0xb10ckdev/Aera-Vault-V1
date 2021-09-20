// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "./interfaces/IBFactory.sol";
import "./interfaces/IBPool.sol";
import "./interfaces/IERC20.sol";
import "https://github.com/balancer-labs/configurable-rights-pool/blob/master/libraries/SmartPoolManager.sol";

contract MammonBalancerPrivatePoolVault {
    uint private constant ONE = 10**18;
    uint private constant MIN_CONVERGENCE_SPEED = 10**12;
    uint private constant MAX_UINT = type(uint).max;
    uint private constant BASE_WEIGHT = ONE * 5;

    IBFactory private bFactory;
    IBPool private bPool;

    address private controller;
    uint private convergenceSpeed;
    uint private targetShare2;
    bool private initialized;
    SmartPoolManager.GradualUpdateParams private gradualUpdate;

    modifier onlyController() {
        require (
            msg.sender == controller,
            "only controller can do action"
        );
        _;
    }

    constructor (address factory) {
        bFactory = IBFactory(factory);
        bPool = bFactory.newBPool();
        controller = msg.sender;
    }

    function init(
        address[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory weights
    )
        external
        onlyController
    {
        require (!initialized, "already initialized");
        require (tokens.length == 2, "need addresses for two tokens");
        require (amounts.length == 2, "need amounts for two tokens");
        require (weights.length == 2, "need weights for two tokens");

        for (uint i = 0; i < tokens.length; i++) {
            IERC20 token = IERC20(tokens[i]);
            // Transfer tokens to this contract
            token.transferFrom(msg.sender, address(this), amounts[i]);
            // Approve the balancer pool
            token.approve(address(bPool), MAX_UINT);
            // Bind tokens
            bPool.bind(tokens[i], amounts[i], weights[i]);
        }

        gradualUpdate.startWeights = weights;
        initialized = true;
    }

    function deposit(uint[] memory amounts) external onlyController {
        // Deposit each amount of tokens
        require (amounts.length == 2, "need amounts for two tokens");

        address[] memory tokens = getCurrentTokens();

        for (uint i = 0; i < tokens.length; i++) {
            IERC20 token = IERC20(tokens[i]);
            uint tokenBalance = getBalance(tokens[i]);
            uint tokenDenorm = getDenormalizedWeight(tokens[i]);

            uint newBalance = tokenBalance + amounts[i];
            uint newDenorm = tokenDenorm * newBalance / tokenBalance;

            if (newBalance > tokenBalance) {
                uint needBalance = newBalance - tokenBalance;
                require (
                    token.transferFrom(msg.sender, address(this), needBalance),
                    "deposit: transferFrom failed"
                );
            }

            if (token.allowance(address(this), address(bPool)) != MAX_UINT) {
                token.approve(address(bPool), MAX_UINT);
            }

            bPool.rebind(tokens[i], newBalance, newDenorm);
        }
    }

    function withdraw(uint[] memory amounts) external onlyController {
        // Withdraw as much as possible up to each amount of tokens
        require (amounts.length == 2, "need amounts for two tokens");

        address[] memory tokens = getCurrentTokens();

        for (uint i = 0; i < tokens.length; i++) {
            uint tokenBalance = getBalance(tokens[i]);
            uint tokenDenorm = getDenormalizedWeight(tokens[i]);

            require (tokenBalance >= amounts[i], "low balance");

            uint newBalance = tokenBalance - amounts[i];
            uint newDenorm = tokenDenorm * newBalance / tokenBalance;

            bPool.rebind(tokens[i], newBalance, newDenorm);

            IERC20 token = IERC20(tokens[i]);
            require (
                token.transfer(msg.sender, token.balanceOf(address(this))),
                "withdraw: transferFrom failed"
            );
        }
    }

    function gulp(address token) external onlyController {
        bPool.gulp(token);
    }

    function updateWeightsGradually(uint[] memory newWeights)
        public
        onlyController
    {
        // Library computes the startBlock,
        // computes startWeights as the current
        // denormalized weights of the core pool tokens.
        require (newWeights.length == 2, "need new weights for two tokens");

        uint endBlock = getExpectedFinalBlock();

        SmartPoolManager.updateWeightsGradually(
            bPool,
            gradualUpdate,
            newWeights,
            block.number,
            endBlock,
            0
        );
    }

    function pokeWeights() external onlyController {
        SmartPoolManager.pokeWeights(bPool, gradualUpdate);
    }

    function setTargetShare2(uint newTargetShare2) external onlyController {
        // Set target share for token2 and call updateWeightsGradually
        require (
            newTargetShare2 <= ONE,
            "targetShare2 mustn't be greater than 1"
        );

        uint w1;
        uint w2;

        if (newTargetShare2 == ONE) {
            w2 = BASE_WEIGHT;
        } else if (newTargetShare2 == 0) {
            w1 = BASE_WEIGHT;
        } else {
            w1 = BASE_WEIGHT;
            w2 = w1 * newTargetShare2 / (ONE - newTargetShare2);
        }

        targetShare2 = newTargetShare2;

        uint[] memory newWeights = new uint[](2);
        newWeights[0] = w1;
        newWeights[1] = w2;

        updateWeightsGradually(newWeights);
    }

    function setController(address newController) external onlyController {
        require (
            newController != address(0),
            "new controller can't be null address"
        );
        controller = newController;
    }

    function setConvergenceSpeed(uint newSpeed) external onlyController {
        convergenceSpeed = newSpeed;
    }

    function setPublicSwap(bool value) external onlyController {
        bPool.setPublicSwap(value);
    }

    function setSwapFee(uint newSwapFee) external onlyController {
        bPool.setSwapFee(newSwapFee);
    }

    function isInitialized() public view returns (bool) {
        return initialized;
    }

    function isPublicSwap() public view returns (bool) {
        return bPool.isPublicSwap();
    }

    function getBFactory() public view returns (IBFactory) {
        return bFactory;
    }

    function getBPool() public view returns (IBPool) {
        return bPool;
    }

    function getCurrentShare2() public view returns (uint) {
        address[] memory tokens = getCurrentTokens();
        uint w1 = getDenormalizedWeight(tokens[0]);
        uint w2 = getDenormalizedWeight(tokens[1]);

        return w2 * ONE / (w1 + w2);
    }

    function getController() public view returns (address) {
        return controller;
    }

    function getConvergenceSpeed() public view returns (uint) {
        return convergenceSpeed;
    }

    function getSwapFee() external view returns (uint) {
        return bPool.getSwapFee();
    }

    function getExpectedFinalBlock() public view returns (uint) {
        return block.number + ONE / convergenceSpeed;
    }

    function getSpotPrice(address tokenIn, address tokenOut)
        public
        view
        returns (uint)
    {
        return bPool.getSpotPrice(tokenIn, tokenOut);
    }

    function getSpotPriceSansFee(address tokenIn, address tokenOut)
        public
        view
        returns (uint)
    {
        return bPool.getSpotPriceSansFee(tokenIn, tokenOut);
    }

    function getBalance(address token) public view returns (uint) {
        return bPool.getBalance(token);
    }

    function getDenormalizedWeight(address token) public view returns (uint) {
        return bPool.getDenormalizedWeight(token);
    }

    function getCurrentTokens() public view returns (address[] memory) {
        return bPool.getCurrentTokens();
    }

    function totalSupply() external view returns (uint) {
        return bPool.totalSupply();
    }
}