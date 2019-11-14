pragma solidity ^0.5.0;

import "./CommonsToken.sol";
import "./vendor/access/Ownable.sol";

contract ArtistToken is CommonsToken, Ownable {
    string public name;   // e.g: Armin Van Lightstreams
    string public symbol; // e.g: AVL

    /*
    * @param _addresses [0] externalToken [1] fundingPool [2] feeRecipient
    */
    constructor (
        string memory _name,
        string memory _symbol,
        address[3] memory _addresses,
        uint32 _reserveRatio,
        uint256 _gasPrice,
        uint256 _theta,
        uint256 _p0,
        uint256 _initialRaise,
        uint256 _friction,
        uint256 _hatchDurationSeconds,
        uint256 _hatchVestingDurationSeconds,
        uint256 _minExternalContribution
    ) public
    CommonsToken(
        _addresses,
        _reserveRatio,
        _gasPrice,
        _theta,
        _p0,
        _initialRaise,
        _friction,
        _hatchDurationSeconds,
        _hatchVestingDurationSeconds,
        _minExternalContribution
    )
    Ownable(msg.sender)
    {
        name = _name;
        symbol = _symbol;
    }
}
