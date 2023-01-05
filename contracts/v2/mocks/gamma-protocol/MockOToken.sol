/**
 * SPDX-License-Identifier: UNLICENSED
 */
pragma solidity 0.8.11;

import "../ERC20Mock.sol";

/**
 * @dev Mock oToken
 *      THIS CONTRACT IS FOR TESTING PURPOSES ONLY. DO NOT USE IN PRODUCTION.
 */
contract MockOToken is ERC20Mock {
    address public controller;
    address public underlyingAsset;
    address public strikeAsset;
    address public collateralAsset;

    uint256 public strikePrice;
    uint256 public expiryTimestamp;

    bool public isPut;

    constructor(
        address _controller,
        address _underlyingAsset,
        address _strikeAsset,
        address _collateralAsset,
        uint256 _strikePrice,
        uint256 _expiryTimestamp,
        bool _isPut
    ) ERC20Mock("ETHUSDC/1597511955/200P/USDC", "oETHUSDCP", 8, 0) {
        controller = _controller;
        underlyingAsset = _underlyingAsset;
        strikeAsset = _strikeAsset;
        collateralAsset = _collateralAsset;
        strikePrice = _strikePrice;
        expiryTimestamp = _expiryTimestamp;
        isPut = _isPut;
    }

    function getOtokenDetails()
        external
        view
        returns (
            address,
            address,
            address,
            uint256,
            uint256,
            bool
        )
    {
        return (
            collateralAsset,
            underlyingAsset,
            strikeAsset,
            strikePrice,
            expiryTimestamp,
            isPut
        );
    }

    function mintOtoken(address _to, uint256 _amount) external {
        _mint(_to, _amount);
    }

    function burnOtoken(address account, uint256 amount) external {
        _burn(account, amount);
    }

    function getChainId() external view returns (uint256 chainId) {
        this; // silence state mutability warning without generating bytecode
        // - see https://github.com/ethereum/solidity/issues/2691
        // solhint-disable-next-line no-inline-assembly
        assembly {
            chainId := chainid()
        }
    }

    function setController(address _controller) public {
        controller = _controller;
    }

    function setUnderlyingAsset(address _underlyingAsset) public {
        underlyingAsset = _underlyingAsset;
    }

    function setStrikeAsset(address _strikeAsset) public {
        strikeAsset = _strikeAsset;
    }

    function setCollateralAsset(address _collateralAsset) public {
        collateralAsset = _collateralAsset;
    }

    function setStrikePrice(uint256 _strikePrice) public {
        strikePrice = _strikePrice;
    }

    function setExpiryTimestamp(uint256 _expiryTimestamp) public {
        expiryTimestamp = _expiryTimestamp;
    }

    function setIsPut(bool _isPut) public {
        isPut = _isPut;
    }
}
