// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

/**
 * @dev Mock Oracle with setLatestAnswer.
 *      THIS CONTRACT IS FOR TESTING PURPOSES ONLY. DO NOT USE IN PRODUCTION.
 */
contract OracleMock {
    uint256 public decimals;
    int256 public answer;
    uint256 public updatedAt;

    constructor(uint256 decimals_) {
        decimals = decimals_;
    }

    function setLatestAnswer(int256 newAnswer) external {
        answer = newAnswer;
    }

    function setUpdatedAt(uint256 newUpdatedAt) external {
        updatedAt = newUpdatedAt;
    }

    function latestAnswer() external view returns (int256) {
        return answer;
    }

    function latestTimestamp() external view returns (uint256) {
        return updatedAt;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80,
            int256,
            uint256,
            uint256,
            uint80
        )
    {
        return (0, answer, 0, updatedAt, 0);
    }
}
