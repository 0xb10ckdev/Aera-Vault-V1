// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

interface IERC20 {
  event Approval(address indexed _owner, address indexed _spender, uint256 _amount);
  event Transfer(address indexed _src, address indexed _dst, uint256 _amount);

  function totalSupply() external view returns (uint256);

  function balanceOf(address _account) external view returns (uint256);

  function allowance(address _owner, address _spender) external view returns (uint256);

  function approve(address _spender, uint256 _amount) external returns (bool);

  function transfer(address _to, uint256 _amount) external returns (bool);

  function transferFrom(address _from, address _to, uint256 _amount) external returns (bool);
}