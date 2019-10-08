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
contract("ArtistTokenPurchases", ([hatcher1, hatcher2, buyer1, buyer2]) => {
  let fundingPool;
  let wPHT;
  let artistToken;
  let artistTokenSymbol;
  let postBuyer1ArtistTokensBalance;

  const INIT_HATCHER_WPHT_BALANCE_PHT = 20000;
  const BUYER_WPHT_BALANCE_PHT = 1000;
  const AMOUNT_TO_RAISE_PHT = 10000;
  const PER_HATCHER_CONTRIBUTION_PHT = AMOUNT_TO_RAISE_PHT / 2;
  const MIN_REQUIRED_HATCHER_CONTRIBUTION_PHT = 100;
  const EXCEEDED_AMOUNT_TO_RAISE_PHT = AMOUNT_TO_RAISE_PHT + 1;
  const INSUFFICIENT_AMOUNT_TO_RAISE_PHT = AMOUNT_TO_RAISE_PHT / 100;
  const INSUFFICIENT_CONTRIBUTION_PHT = MIN_REQUIRED_HATCHER_CONTRIBUTION_PHT - 1;

  const PER_HATCHER_CONTRIBUTION_WEI = toPHTs(PER_HATCHER_CONTRIBUTION_PHT);
  const BUYER_WPHT_BALANCE_WEI = toPHTs(BUYER_WPHT_BALANCE_PHT);
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

    console.log(`Hatcher1 contributed: ${PER_HATCHER_CONTRIBUTION_WEI} WPHT`);

    assert.isFalse(isHatched);

    await wPHT.approve(artistToken.address, PER_HATCHER_CONTRIBUTION_WEI, {from: hatcher2});
    await artistToken.hatchContribute(PER_HATCHER_CONTRIBUTION_WEI, {from: hatcher2});
    isHatched = await artistToken.isHatched();

    console.log(`Hatcher2 contributed: ${PER_HATCHER_CONTRIBUTION_WEI} WPHT`);

    assert.isTrue(isHatched);
  });

  it('should query WPHT and ensure ArtistToken has received the raised amount in WPHTs', async () => {
    const raisedWPHTs = await artistToken.raisedExternal();

    assert.equal(raisedWPHTs.toString(), AMOUNT_TO_RAISE_WEI.toString());
  });

  it('should query WPHT and ensure ArtistToken has received the raised amount in WPHTs minus protocol thetas', async () => {
    const poolBalance = await artistToken.poolBalance();
    const WPHTsBalance = await wPHT.balanceOf(artistToken.address);
    const WPHTsBalanceExpected = toPHTs((DENOMINATOR_PPM - THETA) * AMOUNT_TO_RAISE_PHT / DENOMINATOR_PPM);

    console.log(`ArtistToken received: ${WPHTsBalance} WPHT`);

    assert.equal(WPHTsBalance.toString(), WPHTsBalanceExpected.toString());
    assert.equal(poolBalance.toString(), WPHTsBalanceExpected.toString());
  });

  it('should query WPHT and ensure FundingPool has received its calculated ratio', async () => {
    const WPHTsBalance = await wPHT.balanceOf(fundingPool.address);
    const WPHTsBalanceExpected = toPHTs(AMOUNT_TO_RAISE_PHT * THETA  / DENOMINATOR_PPM);

    console.log(`FundingPool received: ${WPHTsBalance} WPHT`);

    assert.equal(WPHTsBalance.toString(), WPHTsBalanceExpected.toString());
  });

  it('should create a reserve of Artist tokens', async () => {
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

  it('should have assigned correct initial contributions to all hatchers', async () => {
    const contribution = await artistToken.initialContributions(hatcher1);
    const lockedInternal = contribution.lockedInternal;
    const paidExternal = contribution.paidExternal;
    const lockedInternalExpected = toPHTs(PER_HATCHER_CONTRIBUTION_PHT * P0);

    console.log(`Hatcher1 contribution of internal locked artist tokens: ${lockedInternal} ${artistTokenSymbol}`);
    console.log(`Hatcher1 contribution of external paid tokens: ${paidExternal} WPHT`);

    const contribution2 = await artistToken.initialContributions(hatcher2);
    const lockedInternal2 = contribution2.lockedInternal;
    const paidExternal2 = contribution.paidExternal;
    const lockedInternalExpected2 = toPHTs(PER_HATCHER_CONTRIBUTION_PHT * P0);

    console.log(`Hatcher2 contribution of internal locked artist tokens: ${lockedInternal2} ${artistTokenSymbol}`);
    console.log(`Hatcher2 contribution of external paid tokens: ${paidExternal2} WPHT`);

    assert.equal(lockedInternal.toString(), lockedInternalExpected.toString());
    assert.equal(lockedInternal2.toString(), lockedInternalExpected2.toString());

    assert.equal(paidExternal.toString(), PER_HATCHER_CONTRIBUTION_WEI.toString());
    assert.equal(paidExternal2.toString(), PER_HATCHER_CONTRIBUTION_WEI.toString());
  });

  it('should validate a hatcher has 0 claimed tokens and 0 artist tokens in their direct balance prior first purchases from public (all initial tokens are locked)', async () => {
    let balance = await artistToken.balanceOf(hatcher1);

    console.log(`Hatcher1 has prior-minting/claiming balance of: ${balance.toString()} ${artistTokenSymbol}`);

    assert.equal(balance.toString(), "0");
  });

  it('should let average buyer1 to purchase WPHT tokens in order to be able to exchange them for artist tokens afterwards', async () => {
    await wPHT.deposit({
      from: buyer1,
      value: BUYER_WPHT_BALANCE_WEI
    });

    const balance = await wPHT.balanceOf(buyer1);

    assert.equal(balance.toString(), BUYER_WPHT_BALANCE_WEI.toString());
  });

  it('should let a buyer1, an average Joe, to buy(mint) artist tokens in exchange for WPHT', async () => {
    const preFundingPoolWPHTBalance = await wPHT.balanceOf(fundingPool.address);
    const preArtistTokenWPHTBalance = await wPHT.balanceOf(artistToken.address);
    const preArtistTokenTotalSupply = await artistToken.totalSupply();
    const preBuyer1ArtistTokensBalance = await artistToken.balanceOf(buyer1);

    const postArtistTokenWPHTBalanceExpected = preArtistTokenWPHTBalance.add(BUYER_WPHT_BALANCE_WEI);
    const purchasedTokensAmountExpected = await artistToken.calculatePurchaseReturn(preArtistTokenTotalSupply, postArtistTokenWPHTBalanceExpected, RESERVE_RATIO, BUYER_WPHT_BALANCE_WEI);
    const postArtistTokenTotalSupplyExpected = preArtistTokenTotalSupply.add(purchasedTokensAmountExpected);

    console.log(`Prior-buying:`);
    console.log(` - FundingPool balance: ${preFundingPoolWPHTBalance.toString()} WPHT`);
    console.log(` - ArtistToken external balance: ${preArtistTokenWPHTBalance.toString()} WPHT`);
    console.log(` - ArtistToken total supply: ${preArtistTokenTotalSupply.toString()} ${artistTokenSymbol}`);
    console.log(` - Buyer1 purchase cost: ${BUYER_WPHT_BALANCE_WEI.toString()} WPHT`);
    console.log(` - Buyer1 has: ${preBuyer1ArtistTokensBalance.toString()} ${artistTokenSymbol}`);

    await wPHT.approve(artistToken.address, BUYER_WPHT_BALANCE_WEI, {from: buyer1});
    await artistToken.mint(BUYER_WPHT_BALANCE_WEI, {from: buyer1, gasPrice: GAS_PRICE_WEI});

    const postFundingPoolWPHTBalance = await wPHT.balanceOf(fundingPool.address);
    const postArtistTokenWPHTBalance = await wPHT.balanceOf(artistToken.address);
    const postArtistTokenTotalSupply = await artistToken.totalSupply();
    postBuyer1ArtistTokensBalance = await artistToken.balanceOf(buyer1);

    console.log(`Post-buying:`);
    console.log(` - FundingPool balance: ${postFundingPoolWPHTBalance.toString()} WPHT`);
    console.log(` - ArtistToken external balance: ${postArtistTokenWPHTBalance.toString()} WPHT`);
    console.log(` - ArtistToken total supply: ${postArtistTokenTotalSupply.toString()} ${artistTokenSymbol}`);
    console.log(` - Buyer1 has: ${postBuyer1ArtistTokensBalance.toString()} ${artistTokenSymbol}`);

    assert.equal(preFundingPoolWPHTBalance.toString(), postFundingPoolWPHTBalance.toString());
    assert.equal(postArtistTokenWPHTBalance.toString(), postArtistTokenWPHTBalanceExpected.toString());
    assert.equal(postArtistTokenTotalSupply.toString(), postArtistTokenTotalSupplyExpected.toString());
    assert.equal(postBuyer1ArtistTokensBalance.toString(), purchasedTokensAmountExpected.toString());
  });

  it('should be more expensive for buyer2 to purchase artist tokens after buyer1 contribution', async () => {
    await wPHT.deposit({
      from: buyer2,
      value: BUYER_WPHT_BALANCE_WEI
    });
    const balance = await wPHT.balanceOf(buyer2);

    assert.equal(balance.toString(), BUYER_WPHT_BALANCE_WEI.toString());

    await wPHT.approve(artistToken.address, BUYER_WPHT_BALANCE_WEI, {from: buyer2});
    await artistToken.mint(BUYER_WPHT_BALANCE_WEI, {from: buyer2, gasPrice: GAS_PRICE_WEI});

    const buyer2ArtistTokensBalance = await artistToken.balanceOf(buyer2);

    console.log(`Buyer2 purchased ${buyer2ArtistTokensBalance.toString()} ${artistTokenSymbol} with the same purchase cost as Buyer1`);

    assert.isTrue(buyer2ArtistTokensBalance.lt(postBuyer1ArtistTokensBalance));
  });

  // TODO: check that this action unlocks some hatchers tokens
});
