pragma solidity ^0.5.0;

import "./ArtistToken.sol";
import "./vendor/ERC20/IERC20.sol";

contract FundingPoolMock {
  ArtistToken artistToken;

  function setArtistToken(address _artistToken) public {
    artistToken = ArtistToken(_artistToken);
  }

  function allocateFunds(address to, uint256 value) public {
    artistToken.fundsAllocated(value);
    IERC20(artistToken.externalToken()).transfer(to, value);
  }
}
