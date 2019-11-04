/**
 * User: llukac<lukas@lightstreams.io>
 * Date: 07/10/19 14:44
 * Copyright 2019 (c) Lightstreams, Granada
 */

const { BN, constants, expectEvent, shouldFail, ether } = require('openzeppelin-test-helpers');
const { pht2wei, wei2pht } = require('./utils');

const FundingPool = artifacts.require("FundingPool.sol");
const WPHT = artifacts.require("WPHT.sol");
const ArtistToken = artifacts.require("ArtistToken.sol");

contract("ArtistTokenFlow", ([artist, hatcher1, hatcher2, buyer1, buyer2, fundingPoolAccountant, fundingPoolAttacker]) => {
  let fundingPool;
  let wPHT;
  let artistToken;
  let artistTokenSymbol;
  let postBuyer1ArtistTokensBalance;

  const DENOMINATOR_PPM = 1000000;
  const BUYER_WPHT_PURCHASE_COST_PHT = 1000;
  const AMOUNT_TO_RAISE_PHT = 10000;
  const PER_HATCHER_CONTRIBUTION_PHT = AMOUNT_TO_RAISE_PHT / 2;
  const MIN_REQUIRED_HATCHER_CONTRIBUTION_PHT = 100;

  const PER_HATCHER_CONTRIBUTION_WEI = pht2wei(PER_HATCHER_CONTRIBUTION_PHT);
  const BUYER_WPHT_PURCHASE_COST_WEI = pht2wei(BUYER_WPHT_PURCHASE_COST_PHT);
  const AMOUNT_TO_RAISE_WEI = pht2wei(AMOUNT_TO_RAISE_PHT);
  const MIN_REQUIRED_HATCHER_CONTRIBUTION_WEI = pht2wei(MIN_REQUIRED_HATCHER_CONTRIBUTION_PHT);

  const RESERVE_RATIO = 142857; // kappa ~ 6
  const THETA = 350000; // 35% in ppm
  const P0 =  1; // price to purchase during hatching
  const FRICTION = 20000; // 2% in ppm
  const GAS_PRICE_WEI = 15000000000; // 15gwei
  const DURATION = 604800; // 1 week in seconds

  const ARTIST_NAME = 'Armin Van Lightstreams';
  const ARTIST_SYMBOL = 'AVL';

  it('should deploy new ArtistToken', async () => {
    fundingPool = await FundingPool.new();
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
      { from: artist, gas: 10000000 }
    );

    artistTokenSymbol = await artistToken.symbol.call();
  });

  it("Should have Hatchers with positive wPHT(PHT20) balances ready", async () => {
    await wPHT.deposit({
      from: hatcher1,
      value: PER_HATCHER_CONTRIBUTION_WEI
    });

    await wPHT.deposit({
      from: hatcher2,
      value: PER_HATCHER_CONTRIBUTION_WEI
    });

    const hatcher1WPHTBalance = await wPHT.balanceOf(hatcher1);
    const hatcher2WPHTBalance = await wPHT.balanceOf(hatcher2);

    assert.equal(hatcher1WPHTBalance.toString(), PER_HATCHER_CONTRIBUTION_WEI.toString());
    assert.equal(hatcher2WPHTBalance.toString(), PER_HATCHER_CONTRIBUTION_WEI.toString());
  });

  it("Should be in a 'hatching phase' after deployed", async () => {
    const isHatched = await artistToken.isHatched();

    assert.isFalse(isHatched);
  });

  it('should end the hatching phase by contributing configured minimum amount to raise from 2 hatchers', async () => {
    await wPHT.approve(artistToken.address, PER_HATCHER_CONTRIBUTION_WEI, {from: hatcher1});
    await artistToken.hatchContribute(PER_HATCHER_CONTRIBUTION_WEI, {from: hatcher1});
    let isHatched = await artistToken.isHatched();

    console.log(`Hatcher1 contributed: ${wei2pht(PER_HATCHER_CONTRIBUTION_WEI)} WPHT`);

    assert.isFalse(isHatched);

    await wPHT.approve(artistToken.address, PER_HATCHER_CONTRIBUTION_WEI, {from: hatcher2});
    await artistToken.hatchContribute(PER_HATCHER_CONTRIBUTION_WEI, {from: hatcher2});
    isHatched = await artistToken.isHatched();

    console.log(`Hatcher2 contributed: ${wei2pht(PER_HATCHER_CONTRIBUTION_WEI)} WPHT`);

    assert.isTrue(isHatched);
  });

  it('should query WPHT and ensure ArtistToken has received the raised amount in WPHTs', async () => {
    const raisedWPHTs = await artistToken.raisedExternal();

    assert.equal(raisedWPHTs.toString(), AMOUNT_TO_RAISE_WEI.toString());
  });

  it('should query WPHT and ensure ArtistToken has received the raised amount in WPHTs minus protocol thetas', async () => {
    const poolBalance = await artistToken.poolBalance();
    const WPHTsBalance = await wPHT.balanceOf(artistToken.address);
    const WPHTsBalanceExpected = pht2wei((DENOMINATOR_PPM - THETA) * AMOUNT_TO_RAISE_PHT / DENOMINATOR_PPM);

    console.log(`ArtistToken received: ${wei2pht(WPHTsBalance)} WPHT`);

    assert.equal(WPHTsBalance.toString(), WPHTsBalanceExpected.toString());
    assert.equal(poolBalance.toString(), WPHTsBalanceExpected.toString());
  });

  it('should query WPHT and ensure FundingPool has received its calculated ratio', async () => {
    const WPHTsBalance = await wPHT.balanceOf(fundingPool.address);
    const WPHTsBalanceExpected = pht2wei(AMOUNT_TO_RAISE_PHT * THETA  / DENOMINATOR_PPM);

    const tokensBalance = await artistToken.balanceOf(fundingPool.address);

    console.log(`FundingPool received: ${wei2pht(WPHTsBalance)} WPHT`);
    console.log(`FundingPool received: ${wei2pht(tokensBalance)} ${artistTokenSymbol}`);

    assert.equal(WPHTsBalance.toString(), WPHTsBalanceExpected.toString());
  });

  it('should create a reserve of Artist tokens', async () => {
    const tokensAmount = await artistToken.balanceOf(artistToken.address);
    const tokensAmountExpected = pht2wei((AMOUNT_TO_RAISE_PHT / P0 ) * (1 - (THETA  / DENOMINATOR_PPM)));

    console.log(`Artist tokens in reserve: ${wei2pht(tokensAmount)} ${artistTokenSymbol}`);

    assert.equal(tokensAmount.toString(), tokensAmountExpected.toString());
  });

  it('should have increased total supply to the level of reserve itself', async () => {
    const totalSupply = await artistToken.totalSupply();
    const totalSupplyExpected = await artistToken.balanceOf(artistToken.address);

    console.log(`ArtistToken total supply: ${wei2pht(totalSupply)} ${artistTokenSymbol}`);

    assert.equal(totalSupply.toString(), totalSupplyExpected.toString());
  });

  it('should have assigned correct initial contributions to all hatchers', async () => {
    const contribution = await artistToken.initialContributions(hatcher1);
    const lockedInternal = contribution.lockedInternal;
    const paidExternal = contribution.paidExternal;
    const lockedInternalExpected = pht2wei(PER_HATCHER_CONTRIBUTION_PHT * P0);

    console.log(`Hatcher1 contribution of internal locked artist tokens: ${wei2pht(lockedInternal)} ${artistTokenSymbol}`);
    console.log(`Hatcher1 contribution of external paid tokens: ${wei2pht(paidExternal)} WPHT`);

    const contribution2 = await artistToken.initialContributions(hatcher2);
    const lockedInternal2 = contribution2.lockedInternal;
    const paidExternal2 = contribution.paidExternal;
    const lockedInternalExpected2 = pht2wei(PER_HATCHER_CONTRIBUTION_PHT * P0);

    console.log(`Hatcher2 contribution of internal locked artist tokens: ${wei2pht(lockedInternal2)} ${artistTokenSymbol}`);
    console.log(`Hatcher2 contribution of external paid tokens: ${wei2pht(paidExternal2)} WPHT`);

    assert.equal(lockedInternal.toString(), lockedInternalExpected.toString());
    assert.equal(lockedInternal2.toString(), lockedInternalExpected2.toString());

    assert.equal(paidExternal.toString(), PER_HATCHER_CONTRIBUTION_WEI.toString());
    assert.equal(paidExternal2.toString(), PER_HATCHER_CONTRIBUTION_WEI.toString());
  });

  it('should validate a hatcher has 0 claimed tokens and 0 artist tokens in their direct balance prior first purchases from public (all initial tokens are locked)', async () => {
    await artistToken.claimTokens({from: hatcher1});

    let balance = await artistToken.balanceOf(hatcher1);

    console.log(`Hatcher1 has prior-minting/claiming balance of: ${wei2pht(balance)} ${artistTokenSymbol}`);

    assert.equal(balance.toString(), "0");
  });

  it('should let a buyer1, an average Joe, to purchase WPHT tokens in order to be able to exchange them for artist tokens afterwards', async () => {
    await wPHT.deposit({
      from: buyer1,
      value: BUYER_WPHT_PURCHASE_COST_WEI
    });

    const balance = await wPHT.balanceOf(buyer1);

    assert.equal(balance.toString(), BUYER_WPHT_PURCHASE_COST_WEI.toString());
  });

  it('should let a buyer1, an average Joe, to buy(mint) artist tokens in exchange for WPHT', async () => {
    const preFundingPoolWPHTBalance = await wPHT.balanceOf(fundingPool.address);
    const preArtistTokenWPHTBalance = await wPHT.balanceOf(artistToken.address);
    const preArtistTokenTotalSupply = await artistToken.totalSupply();
    const preBuyer1ArtistTokensBalance = await artistToken.balanceOf(buyer1);

    const postArtistTokenWPHTBalanceExpected = preArtistTokenWPHTBalance.add(BUYER_WPHT_PURCHASE_COST_WEI);
    const purchasedTokensAmountExpected = await artistToken.calculatePurchaseReturn(preArtistTokenTotalSupply, postArtistTokenWPHTBalanceExpected, RESERVE_RATIO, BUYER_WPHT_PURCHASE_COST_WEI);
    const postArtistTokenTotalSupplyExpected = preArtistTokenTotalSupply.add(purchasedTokensAmountExpected);

    console.log(`Prior-buying:`);
    console.log(` - FundingPool balance: ${wei2pht(preFundingPoolWPHTBalance)} WPHT`);
    console.log(` - ArtistToken external balance: ${wei2pht(preArtistTokenWPHTBalance)} WPHT`);
    console.log(` - ArtistToken total supply: ${wei2pht(preArtistTokenTotalSupply)} ${artistTokenSymbol}`);
    console.log(` - Buyer1 purchase cost: ${wei2pht(BUYER_WPHT_PURCHASE_COST_WEI)} WPHT`);
    console.log(` - Buyer1 has: ${wei2pht(preBuyer1ArtistTokensBalance)} ${artistTokenSymbol}`);

    await wPHT.approve(artistToken.address, BUYER_WPHT_PURCHASE_COST_WEI, {from: buyer1});
    await artistToken.mint(BUYER_WPHT_PURCHASE_COST_WEI, {from: buyer1, gasPrice: GAS_PRICE_WEI});

    const postFundingPoolWPHTBalance = await wPHT.balanceOf(fundingPool.address);
    const postArtistTokenWPHTBalance = await wPHT.balanceOf(artistToken.address);
    const postArtistTokenTotalSupply = await artistToken.totalSupply();
    postBuyer1ArtistTokensBalance = await artistToken.balanceOf(buyer1);

    console.log(`Post-buying:`);
    console.log(` - FundingPool balance: ${wei2pht(postFundingPoolWPHTBalance)} WPHT`);
    console.log(` - ArtistToken external balance: ${wei2pht(postArtistTokenWPHTBalance)} WPHT`);
    console.log(` - ArtistToken total supply: ${wei2pht(postArtistTokenTotalSupply)} ${artistTokenSymbol}`);
    console.log(` - Buyer1 has: ${wei2pht(postBuyer1ArtistTokensBalance)} ${artistTokenSymbol}`);

    assert.equal(preFundingPoolWPHTBalance.toString(), postFundingPoolWPHTBalance.toString());
    assert.equal(postArtistTokenWPHTBalance.toString(), postArtistTokenWPHTBalanceExpected.toString());
    assert.equal(postArtistTokenTotalSupply.toString(), postArtistTokenTotalSupplyExpected.toString());
    assert.equal(postBuyer1ArtistTokensBalance.toString(), purchasedTokensAmountExpected.toString());
  });

  it('should be more expensive for buyer2 to purchase artist tokens after buyer1 contribution', async () => {
    await wPHT.deposit({
      from: buyer2,
      value: BUYER_WPHT_PURCHASE_COST_WEI
    });
    const balance = await wPHT.balanceOf(buyer2);

    assert.equal(balance.toString(), BUYER_WPHT_PURCHASE_COST_WEI.toString());

    await wPHT.approve(artistToken.address, BUYER_WPHT_PURCHASE_COST_WEI, {from: buyer2});
    await artistToken.mint(BUYER_WPHT_PURCHASE_COST_WEI, {from: buyer2, gasPrice: GAS_PRICE_WEI});

    const buyer2ArtistTokensBalance = await artistToken.balanceOf(buyer2);

    console.log(`Buyer2 purchased only ${wei2pht(buyer2ArtistTokensBalance).toString()} ${artistTokenSymbol} with the same purchase cost as Buyer1`);

    assert.isTrue(buyer2ArtistTokensBalance.lt(postBuyer1ArtistTokensBalance));
  });

  it('should be possible for buyer1 to sell portion (e.g 33%) of its tokens for at least 10% of his purchase cost', async () => {
    const burnAmount = postBuyer1ArtistTokensBalance.div(new BN(3, 10));
    const preFundingPoolWPHTBalance = await wPHT.balanceOf(fundingPool.address);
    const preArtistTokenWPHTBalance = await wPHT.balanceOf(artistToken.address);
    const preBuyer1WPHTBalance = await wPHT.balanceOf(buyer1);
    const preBuyer1ArtistTokensBalance = await artistToken.balanceOf(buyer1);
    const preArtistTokenTotalSupply = await artistToken.totalSupply();

    await artistToken.burn(burnAmount, {from: buyer1, gasPrice: GAS_PRICE_WEI});

    const postFundingPoolWPHTBalance = await wPHT.balanceOf(fundingPool.address);
    const postArtistTokenWPHTBalance = await wPHT.balanceOf(artistToken.address);
    const postBuyer1WPHTBalance = await wPHT.balanceOf(buyer1);
    const postArtistTokenTotalSupply = await artistToken.totalSupply();
    const postArtistTokenTotalSupplyExpected = preArtistTokenTotalSupply.sub(burnAmount);
    const postBuyer1ArtistTokensBalanceExpected = postBuyer1ArtistTokensBalance.sub(burnAmount);
    const postBuyer1MinimumWPHTBalanceExpected = pht2wei(BUYER_WPHT_PURCHASE_COST_PHT / 10);
    postBuyer1ArtistTokensBalance = await artistToken.balanceOf(buyer1);
    const reimbursement = await artistToken.calculateSaleReturn(preArtistTokenTotalSupply, preArtistTokenWPHTBalance, RESERVE_RATIO, burnAmount);
    const fundingPoolWPHTFrictionExpected = reimbursement.mul(new BN(FRICTION, 10)).div(new BN(DENOMINATOR_PPM, 10));
    const postFundingPoolWPHTBalanceExpected = preFundingPoolWPHTBalance.add(fundingPoolWPHTFrictionExpected);

    console.log(`Pre-burning:`);
    console.log(` - FundingPool balance: ${wei2pht(preFundingPoolWPHTBalance)} WPHT`);
    console.log(` - ArtistToken external balance: ${wei2pht(preArtistTokenWPHTBalance)} WPHT`);
    console.log(` - ArtistToken total supply: ${wei2pht(preArtistTokenTotalSupply)} ${artistTokenSymbol}`);
    console.log(` - Buyer1 balance: ${wei2pht(preBuyer1ArtistTokensBalance)} ${artistTokenSymbol}`);
    console.log(` - Buyer1 external balance: ${wei2pht(preBuyer1WPHTBalance)} WPHT`);

    console.log(`Post-burning:`);
    console.log(` - FundingPool balance: ${wei2pht(postFundingPoolWPHTBalance)} WPHT`);
    console.log(` - ArtistToken external balance: ${wei2pht(postArtistTokenWPHTBalance)} WPHT`);
    console.log(` - ArtistToken total supply: ${wei2pht(postArtistTokenTotalSupply)} ${artistTokenSymbol}`);
    console.log(` - Buyer1 burn amount: ${wei2pht(burnAmount)} ${artistTokenSymbol}`);
    console.log(` - Buyer1 has left: ${wei2pht(postBuyer1ArtistTokensBalance)} ${artistTokenSymbol}`);
    console.log(` - Buyer1 previous external balance: ${wei2pht(preBuyer1WPHTBalance)} WPHT`);
    console.log(` - Buyer1 new external balance: ${wei2pht(postBuyer1WPHTBalance)} WPHT`);

    assert.equal(postArtistTokenTotalSupply.toString(), postArtistTokenTotalSupplyExpected.toString());
    assert.equal(postBuyer1ArtistTokensBalance.toString(), postBuyer1ArtistTokensBalanceExpected.toString());

    assert.equal(postFundingPoolWPHTBalance.toString(), postFundingPoolWPHTBalanceExpected.toString());
    assert.isTrue(postBuyer1MinimumWPHTBalanceExpected.lt(postBuyer1WPHTBalance, 'selling 33% of all buyer tokens should be worth at least 10% of his purchase cost'));
    assert.isTrue(postFundingPoolWPHTBalance.gt(preFundingPoolWPHTBalance), 'funding pool balance should increase when burning tokens');
  });

  it('should not be possible to allocate (withdraw) raised funding pool external tokens by a random account', async () => {
    const prefundingPoolBalance = await wPHT.balanceOf(fundingPool.address);
    const preFundingPoolAttackerBalance = await wPHT.balanceOf(fundingPoolAttacker);

    console.log(`Pre-allocating:`);
    console.log(` - FundingPool balance: ${wei2pht(prefundingPoolBalance)} WPHT`);
    console.log(` - FundingPoolAttacker balance: ${wei2pht(preFundingPoolAttackerBalance)} WPHT`);

    await shouldFail.reverting(fundingPool.allocateFunds(artistToken.address, fundingPoolAttacker, prefundingPoolBalance, {from: fundingPoolAttacker}));

    const postFundingPoolBalance = await wPHT.balanceOf(fundingPool.address);
    const postFundingPoolAttackerBalance = await wPHT.balanceOf(fundingPoolAttacker);

    console.log(`Post-allocating:`);
    console.log(` - FundingPool balance: ${wei2pht(postFundingPoolBalance)} WPHT`);
    console.log(` - FundingPoolAttacker balance: ${wei2pht(postFundingPoolAttackerBalance)} WPHT`);

    assert.equal(prefundingPoolBalance.toString(), postFundingPoolBalance.toString(), 'an attacker withdraw artist funding pool!');
    assert.equal(preFundingPoolAttackerBalance.toString(), postFundingPoolAttackerBalance.toString(), 'an attacker withdraw all artist funding pool WPHTs to his account');
  });

  it('should be possible to allocate (withdraw) raised funding pool external tokens by Artist', async () => {
    const prefundingPoolBalance = await wPHT.balanceOf(fundingPool.address);
    const preFundingPoolAccountantBalance = await wPHT.balanceOf(fundingPoolAccountant);

    console.log(`Pre-allocating:`);
    console.log(` - FundingPool balance: ${wei2pht(prefundingPoolBalance)} WPHT`);
    console.log(` - FundingPoolAccountant balance: ${wei2pht(preFundingPoolAccountantBalance)} WPHT`);

    await fundingPool.allocateFunds(artistToken.address, fundingPoolAccountant, prefundingPoolBalance, {from: artist });

    const postFundingPoolBalance = await wPHT.balanceOf(fundingPool.address);
    const postFundingPoolAccountantBalance = await wPHT.balanceOf(fundingPoolAccountant);
    const postFundingPoolAccountantBalanceExpected = preFundingPoolAccountantBalance.add(prefundingPoolBalance);

    console.log(`Post-allocating:`);
    console.log(` - FundingPool balance: ${wei2pht(postFundingPoolBalance)} WPHT`);
    console.log(` - FundingPoolAccountant balance: ${wei2pht(postFundingPoolAccountantBalance)} WPHT`);

    assert.equal(postFundingPoolBalance.toString(), "0");
    assert.equal(postFundingPoolAccountantBalance.toString(), postFundingPoolAccountantBalanceExpected.toString());
  });

  it('should let a hatcher to claim his artist tokens after allocating funds in post-hatch phase', async () => {
    const preClaimContribution = await artistToken.initialContributions(hatcher1);
    const preClaimLockedInternal = preClaimContribution.lockedInternal;
    const preClaimLockedInternalExpected = pht2wei(PER_HATCHER_CONTRIBUTION_PHT * P0);

    const preClaimHatcherWPHTBalance = await wPHT.balanceOf(hatcher1);
    const preClaimHatcherArtistTokensBalance = await artistToken.balanceOf(hatcher1);
    const preClaimFundingPoolWPHTBalance = await wPHT.balanceOf(fundingPool.address);
    const preClaimFundingPoolArtistTokensBalance = await artistToken.balanceOf(fundingPool.address);

    console.log(`Pre-claiming:`);
    console.log(` - FundingPool balance: ${wei2pht(preClaimFundingPoolWPHTBalance)} WPHT`);
    console.log(` - FundingPool balance: ${wei2pht(preClaimFundingPoolArtistTokensBalance)} ${artistTokenSymbol}`);
    console.log(` - Hatcher1 has locked: ${wei2pht(preClaimLockedInternal)} ${artistTokenSymbol}`);
    console.log(` - Hatcher1 balance: ${wei2pht(preClaimHatcherWPHTBalance)} WPHT`);
    console.log(` - Hatcher1 balance: ${wei2pht(preClaimHatcherArtistTokensBalance)} ${artistTokenSymbol}`);

    await artistToken.claimTokens({from: hatcher1});

    const postClaimContribution = await artistToken.initialContributions(hatcher1);
    const postClaimLockedInternal = postClaimContribution.lockedInternal;

    const postClaimHatcherWPHTBalance = await wPHT.balanceOf(hatcher1);
    const postClaimHatcherArtistTokensBalance = await artistToken.balanceOf(hatcher1);
    const postClaimFundingPoolWPHTBalance = await wPHT.balanceOf(fundingPool.address);
    const postClaimFundingPoolArtistTokensBalance = await artistToken.balanceOf(fundingPool.address);

    console.log(`Post-claiming:`);
    console.log(` - FundingPool balance: ${wei2pht(postClaimFundingPoolWPHTBalance)} WPHT`);
    console.log(` - FundingPool balance: ${wei2pht(postClaimFundingPoolArtistTokensBalance)} ${artistTokenSymbol}`);
    console.log(` - Hatcher1 has locked: ${wei2pht(postClaimLockedInternal)} ${artistTokenSymbol}`);
    console.log(` - Hatcher1 balance: ${wei2pht(postClaimHatcherWPHTBalance)} WPHT`);
    console.log(` - Hatcher1 balance: ${wei2pht(postClaimHatcherArtistTokensBalance)} ${artistTokenSymbol}`);

    assert.equal(preClaimLockedInternal.toString(), preClaimLockedInternalExpected.toString());
    assert.isTrue(postClaimLockedInternal.lt(preClaimLockedInternal), "no hatcher's locked internal artist tokens got unlocked");
    assert.isTrue(postClaimHatcherArtistTokensBalance.gt(preClaimHatcherArtistTokensBalance), "hatcher artist tokens balance didn't increase");
  });

  it('should be possible for hatcher to sell his claimed tokens', async () => {
    const burnAmount = await artistToken.balanceOf(hatcher1);
    const preBurnHatcherWPHTBalance = await wPHT.balanceOf(hatcher1);

    await artistToken.burn(burnAmount, {from: hatcher1, gasPrice: GAS_PRICE_WEI});

    const postBurnHatcherWPHTBalance = await wPHT.balanceOf(hatcher1);
    const revenue = postBurnHatcherWPHTBalance.sub(preBurnHatcherWPHTBalance);

    console.log(`Hatcher1 sold ${wei2pht(burnAmount)} ${artistTokenSymbol} for ${wei2pht(revenue)} WPHT`);

    assert.isTrue(postBurnHatcherWPHTBalance.gt(preBurnHatcherWPHTBalance));
  });
});
