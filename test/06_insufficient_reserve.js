/**
 * User: llukac<lukas@lightstreams.io>
 * Date: 07/10/19 14:44
 * Copyright 2019 (c) Lightstreams, Granada
 */

const { BN, shouldFail } = require('openzeppelin-test-helpers');
const { pht2wei, wei2pht, sleep } = require('./utils');

const FundingPool = artifacts.require("FundingPool.sol");
const WPHT = artifacts.require("WPHT.sol");
const ArtistToken = artifacts.require("ArtistToken.sol");

contract("InsufficientReserve", ([artist, hatcher, buyer]) => {
  let fundingPool;
  let wPHT;
  let artistToken;
  let artistTokenSymbol;

  const DENOMINATOR_PPM = 1000000;
  const AMOUNT_TO_RAISE_PHT = 10000; // 100€
  const AMOUNT_TO_RAISE_WEI = pht2wei(AMOUNT_TO_RAISE_PHT);
  const RESERVE_RATIO = 142857; // kappa ~ 6
  const THETA = 350000; // 35% in ppm
  const P0 =  1; // price to purchase during hatching
  const FRICTION = 100000; // 10% in ppm
  const GAS_PRICE_WEI = 15000000000; // 15 gwei
  const HATCH_DURATION_SECONDS = 3024000; // 5 weeks
  const HATCH_VESTING_DURATION_SECONDS = 0; // 0 seconds

  const ARTIST_NAME = 'Armin Van Lightstreams';
  const ARTIST_SYMBOL = 'AVL';

  it('should deploy new ArtistToken', async () => {
    fundingPool = await FundingPool.new({ from: artist });
    wPHT = await WPHT.new();

    artistToken = await ArtistToken.new(
      ARTIST_NAME,
      ARTIST_SYMBOL,
      [wPHT.address, fundingPool.address, fundingPool.address],
      RESERVE_RATIO,
      GAS_PRICE_WEI,
      THETA,
      P0,
      AMOUNT_TO_RAISE_WEI,
      FRICTION,
      HATCH_DURATION_SECONDS,
      HATCH_VESTING_DURATION_SECONDS,
      AMOUNT_TO_RAISE_WEI,
      { from: artist, gas: 10000000 }
    );

    artistTokenSymbol = await artistToken.symbol.call();
  });

  it("should hatch artist", async () => {
    await wPHT.deposit({
      from: hatcher,
      value: AMOUNT_TO_RAISE_WEI
    });

    await wPHT.approve(artistToken.address, AMOUNT_TO_RAISE_WEI, {from: hatcher});
    await artistToken.hatchContribute(AMOUNT_TO_RAISE_WEI, {from: hatcher});

    let isHatched = await artistToken.isHatched();

    assert.isTrue(isHatched);
  });

  it("should let buyer to perform many purchases/sales to make funding pool rich", async () => {
    const depositWei = pht2wei(AMOUNT_TO_RAISE_PHT * 2);

    for (let i = 0; i < 50; i++) {
      await wPHT.deposit({ from: buyer, value: depositWei});
      await wPHT.approve(artistToken.address, depositWei, {from: buyer});
      await artistToken.mint(depositWei, {from: buyer, gasPrice: GAS_PRICE_WEI});

      const sellAmount = await artistToken.balanceOf(buyer);

      await artistToken.burn(sellAmount, {from: buyer, gasPrice: GAS_PRICE_WEI});
    }

    await wPHT.deposit({ from: buyer, value: depositWei});
    await wPHT.approve(artistToken.address, depositWei, {from: buyer});
    await artistToken.mint(depositWei, {from: buyer, gasPrice: GAS_PRICE_WEI});
  });

  it("should let artist to allocate funds causing all hatcher tokens to unlock", async () => {
    const balance = await wPHT.balanceOf(fundingPool.address);

    await fundingPool.allocateFunds(artistToken.address, artist, balance, {from: artist });
  });

  it("should be possible for a hatcher to claim ALL unlocked tokens", async () => {
    const preClaimContribution = await artistToken.initialContributions(hatcher);
    const preClaimLockedInternal = preClaimContribution.lockedInternal;

    await artistToken.claimTokens({from: hatcher});

    const postClaimContribution = await artistToken.initialContributions(hatcher);
    const postClaimLockedInternal = postClaimContribution.lockedInternal;
    const postClaimBalance = await artistToken.balanceOf(hatcher);

    assert.equal(postClaimLockedInternal.toString(), "0");
    assert.equal(postClaimBalance.toString(), preClaimLockedInternal.toString());
  });
});
