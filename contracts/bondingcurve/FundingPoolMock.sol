pragma solidity ^0.5.0;

import "./CommonsToken.sol";
import "./vendor/ERC20/IERC20.sol";

contract FundingPoolMock {

  CommonsToken commonsToken;

  function setCommonsToken(address _commonsToken) public {
    commonsToken = CommonsToken(_commonsToken);
  }

  // Note: function not secure => via this function all fundingPool tokens can be withdrawn
  function allocateFunds(address to, uint256 value) public {
    commonsToken.fundsAllocated(value);
    IERC20(commonsToken.externalToken()).transfer(to, value);
  }
}
