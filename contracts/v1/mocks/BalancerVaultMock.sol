// SPDX-License-Identifier: UNLICENSED
// solhint-disable-next-line compiler-version
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "../dependencies/balancer-labs/pool-utils/contracts/test/MockVault.sol";
import "../dependencies/balancer-labs/interfaces/contracts/vault/IVault.sol";
import "../dependencies/balancer-labs/solidity-utils/contracts/openzeppelin/SafeERC20.sol";

/**
 * @dev Mock Balancer Vault with joinPool and managePoolBalance function.
 *      THIS CONTRACT IS FOR TESTING PURPOSES ONLY. DO NOT USE IN PRODUCTION.
 */
contract BalancerVaultMock is MockVault {
    using SafeERC20 for IERC20;

    constructor(IAuthorizer authorizer) MockVault(authorizer) {
        // solhint-disable-previous-line no-empty-blocks
    }

    // solhint-disable no-unused-vars
    function joinPool(
        bytes32 poolId,
        address sender,
        address recipient,
        IVault.JoinPoolRequest memory request
    ) external {
        IAsset[] memory tokens = request.assets;
        uint256[] memory amounts = request.maxAmountsIn;

        for (uint256 i = 0; i < tokens.length; i++) {
            IERC20 token = IERC20(address(tokens[i]));
            token.safeTransferFrom(msg.sender, address(this), amounts[i]);
        }

        this.updateBalances(poolId, amounts);
    }

    function managePoolBalance(IVault.PoolBalanceOp[] memory ops) external {
        bytes32 poolId = ops[0].poolId;
        (, uint256[] memory amounts) = this.getPoolTokens(poolId);
        for (uint256 i = 0; i < ops.length; i++) {
            if (ops[i].kind == IVault.PoolBalanceOpKind.DEPOSIT) {
                amounts[i] += ops[i].amount;
            } else if (ops[i].kind == IVault.PoolBalanceOpKind.WITHDRAW) {
                amounts[i] -= ops[i].amount;
            } else if (ops[i].kind == IVault.PoolBalanceOpKind.UPDATE) {
                uint256 totalAmount = ops[i].amount + amounts[i];
                uint256 balance = ops[i].token.balanceOf(address(this));
                if (balance < totalAmount) {
                    ops[i].token.safeTransferFrom(
                        msg.sender,
                        address(this),
                        totalAmount - balance
                    );
                } else if (balance > totalAmount) {
                    ops[i].token.safeTransfer(
                        msg.sender,
                        balance - totalAmount
                    );
                }
            }
        }

        this.updateBalances(poolId, amounts);
    }
}
