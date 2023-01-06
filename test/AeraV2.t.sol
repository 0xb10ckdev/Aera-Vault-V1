// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.11;

import "forge-std/Test.sol";
import "../contracts/v2/mocks/AeraVaultV2Mock.sol";
import "../contracts/v2/interfaces/IAeraVaultV2.sol";

import "../contracts/v2/dependencies/balancer-labs/pool-weighted/contracts/managed/ManagedPoolFactory.sol";

contract AeraVaultV2Test is Test {
    AeraVaultV2Mock public aera;
    address public manager;

    uint256 private constant ONE = 1e18;

    uint256 private constant MIN_SWAP_FEE = 0.000001e18;
    uint256 private constant MIN_RELIABLE_VAULT_VALUE = 1e18; // Minimum reliable vault TVL in base token
    uint256 private constant MIN_SIGNIFICANT_DEPOSIT_VALUE = 20e18; // Minimum significant deposit value. It will be measured in base token terms.
    uint256 private constant MAX_ORACLE_SPOT_DIVERGENCE = 1.1e18; // Maximum oracle spot price divergence.
    uint256 private constant MAX_ORACLE_DELAY = 5 * 60 * 60; // Maximum update delay of oracles.
    uint256 private constant MIN_FEE_DURATION = 2 * 30 * 24 * 60 * 60; // Minimum period to charge guaranteed management fee.
    uint256 private constant MAX_MANAGEMENT_FEE = 0.000000001e18; // 60 days in seconds
    address private constant ZERO_ADDRESS = address(0);

    function setUp() public {
        IVault bVault = IVault(
            deployCode("BalancerVaultMock.sol", abi.encode(ZERO_ADDRESS))
        );
        IProtocolFeePercentagesProvider protocolFeeProvider = IProtocolFeePercentagesProvider(
                deployCode(
                    "ProtocolFeePercentagesProvider.sol",
                    abi.encode(bVault, ONE, ONE)
                )
            );

        /*
        TODO: Waiting for https://github.com/foundry-rs/foundry/issues/4049 to be resolved
        address factory = deployCode(
            "ManagedPoolFactory.sol",
            abi.encode(bVault, protocolFeeProvider)
        );
        */

        ManagedPoolFactory factory = new ManagedPoolFactory(
            bVault,
            protocolFeeProvider
        );

        IERC20 token0 = IERC20(
            deployCode(
                "ERC20Mock.sol",
                abi.encode("Token0 Test", "TTOKEN0", 18, 1000000000e18)
            )
        );
        IERC20 token1 = IERC20(
            deployCode(
                "ERC20Mock.sol",
                abi.encode("Token1 Test", "TTOKEN1", 18, 1000000000e18)
            )
        );
        IERC4626 yToken0 = IERC4626(
            deployCode(
                "ERC4626Mock.sol",
                abi.encode(token0, "YIELD BEARING Token0 Test", "YB TTOKEN0")
            )
        );

        IERC20[] memory sortedTokens = new IERC20[](2);
        IAeraVaultV2.YieldToken[]
            memory yieldTokens = new IAeraVaultV2.YieldToken[](1);
        if (token0 < token1) {
            sortedTokens[0] = token0;
            sortedTokens[1] = token1;
            yieldTokens[0] = IAeraVaultV2.YieldToken(yToken0, 0, true);
        } else {
            sortedTokens[0] = token1;
            sortedTokens[1] = token0;
            yieldTokens[0] = IAeraVaultV2.YieldToken(yToken0, 1, true);
        }

        uint256[] memory validWeights = new uint256[](2);
        validWeights[0] = 5e17;
        validWeights[1] = 5e17;

        AggregatorV2V3Interface[]
            memory oracleAddresses = new AggregatorV2V3Interface[](2);
        // ignoring 0 as numeraire asset does not need an oracle
        oracleAddresses[1] = AggregatorV2V3Interface(
            deployCode("OracleMock.sol", abi.encode(8))
        );

        manager = address(0xFADED);

        IAeraVaultV2.NewVaultParams memory vaultParams = IAeraVaultV2
            .NewVaultParams(
                address(factory),
                "Test",
                "TEST",
                sortedTokens,
                validWeights,
                oracleAddresses,
                yieldTokens,
                0,
                MIN_SWAP_FEE,
                manager,
                MIN_RELIABLE_VAULT_VALUE,
                MIN_SIGNIFICANT_DEPOSIT_VALUE,
                MAX_ORACLE_SPOT_DIVERGENCE,
                MAX_ORACLE_DELAY,
                MIN_FEE_DURATION,
                MAX_MANAGEMENT_FEE,
                ZERO_ADDRESS,
                "Test vault description"
            );
        aera = new AeraVaultV2Mock(vaultParams);
    }

    function testVault() public {
        assertEq(true, true);
    }
}
