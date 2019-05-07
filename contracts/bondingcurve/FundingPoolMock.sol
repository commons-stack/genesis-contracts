pragma solidity ^0.5.0;

import "./CommonsToken.sol";

contract FundingPoolMock {

  CommonsToken commonsToken;

  function setCommonsToken(address _commonsToken) public {
    commonsToken = CommonsToken(_commonsToken);
  }

  function allocateFunds(address to, uint256 value) public {
    commonsToken.fundsAllocated(value);
    commonsToken.transfer(to, value);
  }
}
