// ReserveTokenMock will be an existing smart contract (DAI)
const WPHT = artifacts.require("WPHT");
const ArtistToken = artifacts.require("ArtistToken");
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

  await deployer.deploy(WPHT, accounts[0]);
  const wPHT = await WPHT.deployed();

  await deployer.deploy(
    ArtistToken,
    "Armin Van Lightstreams",
    "AVL",
    wPHT.address, // _externalToken
    reserveRatio,
    gasPrice,
    theta,
    p0,
    initialRaise,
    FundingPoolMockInstance.address,
    friction,
    duration,
    minExternalContibution,
    { gas: 20000000 }
  );
};
