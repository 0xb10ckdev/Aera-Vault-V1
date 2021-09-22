// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7;

import "./dependencies/openzeppelin/SafeERC20.sol";
import "./dependencies/openzeppelin/IERC20.sol";
import "./dependencies/openzeppelin/Ownable.sol";
import "./dependencies/openzeppelin/ReentrancyGuard.sol";
import "./dependencies/openzeppelin/Initializable.sol";
import "./interfaces/IBFactory.sol";
import "./interfaces/IBPool.sol";
import "./interfaces/IMammonVaultV0.sol";
import "./libraries/SmartPoolManager.sol";

contract MammonVaultV0 is
    IMammonVaultV0,
    Initializable,
    Ownable,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;

    IBPool public immutable pool;
    address public immutable token0;
    address public immutable token1;

    address public manager;
    SmartPoolManager.GradualUpdateParams private gradualUpdate;

    event Deposit(
        address indexed caller,
        uint256 amount0,
        uint256 amount1,
        uint256 weight0,
        uint256 weight1
    );

    event Withdraw(
        address indexed caller,
        uint256 amount0,
        uint256 amount1,
        uint256 weight0,
        uint256 weight1
    );

    event ManagerChanged(
        address indexed previousManager,
        address indexed manager
    );

    modifier onlyManager() {
        require(msg.sender == manager, "caller is not the manager");
        _;
    }

    constructor(
        address _factory,
        address _token0,
        address _token1,
        address _manager
    ) {
        pool = IBPool(IBFactory(_factory).newBPool());
        token0 = _token0;
        token1 = _token1;
        manager = _manager;
        emit ManagerChanged(address(0), _manager);
    }

    function initialDeposit(
        uint256 amount0,
        uint256 amount1,
        uint256 weight0,
        uint256 weight1
    ) external override initializer onlyManager {
        require(weight0 >= pool.MIN_WEIGHT(), "weight is less than min");
        require(weight0 <= pool.MAX_WEIGHT(), "weight is greater than max");
        require(amount0 >= pool.MIN_BALANCE(), "amount is less than min");

        require(weight1 >= pool.MIN_WEIGHT(), "weight is less than min");
        require(weight1 <= pool.MAX_WEIGHT(), "weight is greater than max");
        require(amount1 >= pool.MIN_BALANCE(), "amount is less than min");

        bindToken(token0, amount0, weight0);
        bindToken(token1, amount1, weight1);

        gradualUpdate.startWeights = [weight0, weight1];

        emit Deposit(msg.sender, amount0, amount1, weight0, weight1);
    }

    function deposit(uint256 amount0, uint256 amount1)
        external
        override
        onlyManager
        nonReentrant
    {
        if (amount0 > 0) {
            depositToken(token0, amount0, holdings0());
        }
        if (amount1 > 0) {
            depositToken(token1, amount1, holdings1());
        }

        uint256 weight0 = getDenormalizedWeight(token0);
        uint256 weight1 = getDenormalizedWeight(token1);

        emit Deposit(msg.sender, amount0, amount1, weight0, weight1);
    }

    function withdraw(uint256 amount0, uint256 amount1)
        external
        override
        onlyManager
        nonReentrant
    {
        if (amount0 > 0) {
            withdrawToken(token0, amount0, holdings0());
        }
        if (amount1 > 0) {
            withdrawToken(token1, amount1, holdings1());
        }

        uint256 weight0 = getDenormalizedWeight(token0);
        uint256 weight1 = getDenormalizedWeight(token1);

        emit Withdraw(msg.sender, amount0, amount1, weight0, weight1);
    }

    function updateWeightsGradually(
        uint256 weight0,
        uint256 weight1,
        uint256 startBlock,
        uint256 endBlock
    ) public override onlyManager {
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

    function changeManager(address newManager) external override onlyOwner {
        require(newManager != address(0), "manager mustn't be zero address");
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
        require(_amount > 0, "deposit amount must greater than 0");

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
        uint256 _balance
    ) internal {
        uint256 tokenDenorm = getDenormalizedWeight(_token);

        require(_balance >= _amount, "low balance");

        uint256 newBalance = _balance - _amount;
        uint256 newDenorm = (tokenDenorm * newBalance) / _balance;

        pool.rebind(_token, newBalance, newDenorm);

        IERC20 token = IERC20(_token);
        token.safeTransfer(msg.sender, token.balanceOf(address(this)));
    }
}
