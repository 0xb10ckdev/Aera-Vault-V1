// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

/**
 * @dev Mock MammonVaultV2 with getting spot prices.
 *      THIS CONTRACT IS FOR TESTING PURPOSES ONLY. DO NOT USE IN PRODUCTION.
 */
contract OracleMock {
    uint256 public decimals;
    int256 public answer;

    constructor(uint256 decimals_) {
        decimals = decimals_;
    }

    function setLatestAnswer(int256 newAnswer) external {
        answer = newAnswer;
    }

    function latestAnswer() external view returns (int256) {
        return answer;
    }
}
