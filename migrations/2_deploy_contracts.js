// ReserveTokenMock will be an existing smart contract (DAI)
const ExternalTokenMock = artifacts.require("ERC20Mintable");
const CommonsToken = artifacts.require("CommonsToken");
const FundingPoolMock = artifacts.require("FundingPoolMock");

// Curve parameters:
const reserveRatio = 142857;  // Kappa (~ 6)
const theta = 350000;         // 35% in ppm
const p0 =  1;                // Price of internal token in external tokens.
const initialRaise = 300000;  // Raise amount in external tokens.
const friction = 20000;       // 2% in ppm

const gasPrice = 15000000000; // 15 gwei

const duration = 3024000000000000; // ~5 weeks.
const minExternalContibution = 100000;


module.exports = async function(deployer, networks, accounts) {
  await deployer.deploy(FundingPoolMock);
  FundingPoolMockInstance = await FundingPoolMock.deployed();

  await deployer.deploy(ExternalTokenMock, accounts[0]);
  ExternalTokenMockInstance = await ExternalTokenMock.deployed();

  await deployer.deploy(CommonsToken,
    ExternalTokenMock.address, // _externalToken
    reserveRatio,                     // _reserveRatio
    gasPrice,                         // _gasPrice
    theta,                            // _theta
    p0,                               // _p0
    initialRaise,                     // _initialRaise
    FundingPoolMockInstance.address,  // _fundingPool
    friction,                         // _friction
    duration,                         // _duration
    minExternalContibution,           // _minExternalContribution
    { gas: 20000000 }
  );

  // needed for demonstration purposes => to show we can purchase tokens during the hatchin phase
  await ExternalTokenMockInstance.mint(accounts[0], 100000, {from: accounts[0]})
};
