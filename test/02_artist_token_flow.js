/**
 * User: llukac<lukas@lightstreams.io>
 * Date: 07/10/19 14:44
 * Copyright 2019 (c) Lightstreams, Granada
 */

const { BN, constants, expectEvent, shouldFail, ether } = require('openzeppelin-test-helpers');

const toPHTs = (value) => {
  return ether(value.toString());
};

const FundingPoolMock = artifacts.require("FundingPoolMock.sol");
const WPHT = artifacts.require("WPHT.sol");
const ArtistToken = artifacts.require("ArtistToken.sol");

const DENOMINATOR_PPM = 1000000;
contract("ArtistTokenPurchases", ([hatcher1, hatcher2, lateInvestor]) => {
  let fundingPool;
  let wPHT;
  let artistToken;
  let artistTokenSymbol;

  const INIT_HATCHER_WPHT_BALANCE_PHT = 20000;
  const AMOUNT_TO_RAISE_PHT = 10000;
  const PER_HATCHER_CONTRIBUTION_PHT = AMOUNT_TO_RAISE_PHT / 2;
  const MIN_REQUIRED_HATCHER_CONTRIBUTION_PHT = 100;
  const EXCEEDED_AMOUNT_TO_RAISE_PHT = AMOUNT_TO_RAISE_PHT + 1;
  const INSUFFICIENT_AMOUNT_TO_RAISE_PHT = AMOUNT_TO_RAISE_PHT / 100;
  const INSUFFICIENT_CONTRIBUTION_PHT = MIN_REQUIRED_HATCHER_CONTRIBUTION_PHT - 1;

  const PER_HATCHER_CONTRIBUTION_WEI = toPHTs(PER_HATCHER_CONTRIBUTION_PHT);
  const INIT_HATCHER_WPHT_BALANCE_WEI = toPHTs(INIT_HATCHER_WPHT_BALANCE_PHT);
  const AMOUNT_TO_RAISE_WEI = toPHTs(AMOUNT_TO_RAISE_PHT);
  const MIN_REQUIRED_HATCHER_CONTRIBUTION_WEI = toPHTs(MIN_REQUIRED_HATCHER_CONTRIBUTION_PHT);
  const EXCEEDED_AMOUNT_TO_RAISE_WEI = toPHTs(EXCEEDED_AMOUNT_TO_RAISE_PHT);
  const INSUFFICIENT_AMOUNT_TO_RAISE_WEI = toPHTs(INSUFFICIENT_AMOUNT_TO_RAISE_PHT);
  const INSUFFICIENT_CONTRIBUTION_WEI = toPHTs(INSUFFICIENT_CONTRIBUTION_PHT);

  const RESERVE_RATIO = 142857; // kappa ~ 6
  const THETA = 350000; // 35% in ppm
  const P0 =  1; // price to purchase during hatching
  const FRICTION = 20000; // 2% in ppm
  const GAS_PRICE_WEI = 15000000000; // 15gwei
  const DURATION = 604800; // 1 week in seconds

  const ARTIST_NAME = 'Armin Van Lightstreams';
  const ARTIST_SYMBOL = 'AVL';

  it('should deploy new ArtistToken', async () => {
    fundingPool = await FundingPoolMock.new();
    wPHT = await WPHT.new();

    artistToken = await ArtistToken.new(
      ARTIST_NAME,
      ARTIST_SYMBOL,
      wPHT.address,
      RESERVE_RATIO,
      GAS_PRICE_WEI,
      THETA,
      P0,
      AMOUNT_TO_RAISE_WEI,
      fundingPool.address,
      FRICTION,
      DURATION,
      MIN_REQUIRED_HATCHER_CONTRIBUTION_WEI,
      { gas: 10000000 }
    );
  });

  it("Should have Hatchers with positive wPHT(PHT20) balances ready", async () => {
    await wPHT.deposit({
      from: hatcher1,
      value: INIT_HATCHER_WPHT_BALANCE_WEI
    });

    await wPHT.deposit({
      from: hatcher2,
      value: INIT_HATCHER_WPHT_BALANCE_WEI
    });

    const hatcher1WPHTBalance = await wPHT.balanceOf(hatcher1);
    const hatcher2WPHTBalance = await wPHT.balanceOf(hatcher2);

    assert.equal(hatcher1WPHTBalance.toString(), INIT_HATCHER_WPHT_BALANCE_WEI.toString());
    assert.equal(hatcher2WPHTBalance.toString(), INIT_HATCHER_WPHT_BALANCE_WEI.toString());
  });

  it("Should be in a 'hatching phase' after deployed", async () => {
    const isHatched = await artistToken.isHatched();

    assert.isFalse(isHatched);
  });

  it('should end the hatching phase by contributing configured minimum amount to raise from 2 hatchers', async () => {
    await wPHT.approve(artistToken.address, PER_HATCHER_CONTRIBUTION_WEI, {from: hatcher1});
    await artistToken.hatchContribute(PER_HATCHER_CONTRIBUTION_WEI, {from: hatcher1});
    let isHatched = await artistToken.isHatched();

    console.log(`Hatcher1 contributed: ${PER_HATCHER_CONTRIBUTION_WEI} WPHTs`);

    assert.isFalse(isHatched);

    await wPHT.approve(artistToken.address, PER_HATCHER_CONTRIBUTION_WEI, {from: hatcher2});
    await artistToken.hatchContribute(PER_HATCHER_CONTRIBUTION_WEI, {from: hatcher2});
    isHatched = await artistToken.isHatched();

    console.log(`Hatcher2 contributed: ${PER_HATCHER_CONTRIBUTION_WEI} WPHTs`);

    assert.isTrue(isHatched);
  });

  it('should query WPHT and ensure ArtistToken has received the raised amount in WPHTs', async () => {
    const raisedWPHTs = await artistToken.raisedExternal();

    assert.equal(raisedWPHTs.toString(), AMOUNT_TO_RAISE_WEI.toString());
  });

  it('should query WPHT and ensure ArtistToken has received the raised amount in WPHTs minus protocol thetas', async () => {
    const WPHTsBalance = await wPHT.balanceOf(artistToken.address);
    const WPHTsBalanceExpected = toPHTs((DENOMINATOR_PPM - THETA) * AMOUNT_TO_RAISE_PHT / DENOMINATOR_PPM);

    console.log(`ArtistToken received: ${WPHTsBalance} WPHTs`);

    assert.equal(WPHTsBalance.toString(), WPHTsBalanceExpected.toString());
  });

  it('should query WPHT and ensure FundingPool has received its calculated ratio', async () => {
    const WPHTsBalance = await wPHT.balanceOf(fundingPool.address);
    const WPHTsBalanceExpected = toPHTs(AMOUNT_TO_RAISE_PHT * THETA  / DENOMINATOR_PPM);

    console.log(`FundingPool received: ${WPHTsBalance} WPHTs`);

    assert.equal(WPHTsBalance.toString(), WPHTsBalanceExpected.toString());
  });

  it('should have reserve minted Artist tokens for ArtistToken itself', async () => {
    artistTokenSymbol = await artistToken.symbol.call();
    const tokensAmount = await artistToken.balanceOf(artistToken.address);
    const tokensAmountExpected = toPHTs((AMOUNT_TO_RAISE_PHT / P0 ) * (1 - (THETA  / DENOMINATOR_PPM)));

    console.log(`Artist tokens in reserve: ${tokensAmount} ${artistTokenSymbol}`);

    assert.equal(tokensAmount.toString(), tokensAmountExpected.toString());
  });

  it('should have increased total supply to the level of reserve itself', async () => {
    const totalSupply = await artistToken.totalSupply();
    const totalSupplyExpected = await artistToken.balanceOf(artistToken.address);

    console.log(`ArtistToken total supply: ${totalSupply} ${artistTokenSymbol}`);

    assert.equal(totalSupply.toString(), totalSupplyExpected.toString());
  });

  it('should have assigned minted Artist tokens to all hatchers', async () => {
    const contribution = await artistToken.initialContributions(hatcher1);
    const lockedInternal = contribution.lockedInternal;
    const lockedInternalExpected = toPHTs(PER_HATCHER_CONTRIBUTION_PHT * P0);

    console.log(`Hatcher1 internal locked minted tokens: ${lockedInternal} ${artistTokenSymbol}`);

    const contribution2 = await artistToken.initialContributions(hatcher2);
    const lockedInternal2 = contribution2.lockedInternal;
    const lockedInternalExpected2 = toPHTs(PER_HATCHER_CONTRIBUTION_PHT * P0);

    console.log(`Hatcher2 internal locked minted tokens: ${lockedInternal2} ${artistTokenSymbol}`);

    assert.equal(lockedInternal.toString(), lockedInternalExpected.toString());
    assert.equal(lockedInternal2.toString(), lockedInternalExpected2.toString());
  });
});
