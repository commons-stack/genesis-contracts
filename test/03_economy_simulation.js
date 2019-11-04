/**
 * User: llukac<lukas@lightstreams.io>
 * Date: 28/10/19 14:44
 * Copyright 2019 (c) Lightstreams, Granada
 */

require('dotenv').config({ path: `${process.env.PWD}/.env` });

const { pht2wei, wei2pht, pht2euro, wei2euro, calcPercentageIncrease } = require('./utils');

const FundingPool = artifacts.require("FundingPool.sol");
const WPHT = artifacts.require("WPHT.sol");
const ArtistToken = artifacts.require("ArtistToken.sol");

contract("EconomySimulation", ([lsAcc, artist, hatcher, buyer1, buyerSimulator, lastBuyer]) => {
  let fundingPool;
  let wPHT;
  let artistToken;
  let artistTokenSymbol;

  const HATCH_LIMIT_PHT = process.env.HATCH_LIMIT_PHT;
  const HATCH_LIMIT_WEI = pht2wei(HATCH_LIMIT_PHT);

  const DENOMINATOR_PPM = 1000000;
  const RESERVE_RATIO = process.env.RESERVE_RATIO; // kappa ~ 6
  const THETA = process.env.FUNDING_POOL_HATCH_PERCENTAGE; // 35% in ppm
  const P0 =  process.env.HATCH_PRICE_PER_TOKEN; // price to purchase during hatching
  const FRICTION = process.env.FUNDING_POOL_BURN_PERCENTAGE; // 2% in ppm
  const GAS_PRICE_WEI = process.env.GAS_PRICE_WEI; // 15gwei
  const DURATION = process.env.HATCH_DURATION_SECONDS; // 1 week in seconds

  const ARTIST_NAME = 'Lightstreams Van Economy';
  const ARTIST_SYMBOL = 'LVE';

  const BUYERS = parseInt(process.env.BUYERS);
  const BUYER_CAPITAL_PHT = process.env.BUYER_CAPITAL_PHT;
  const BUYER_CAPITAL_WEI = pht2wei(BUYER_CAPITAL_PHT);

  const SELLER_RATIO = parseFloat(process.env.SELLER_RATIO);
  const SELLER_AMOUNT_RATIO = parseFloat(process.env.SELLER_AMOUNT_RATIO);
  const SELLERS = Math.round(BUYERS * SELLER_RATIO);

  const PRINT_MARKET_ACTIVITY = process.env.PRINT_MARKET_ACTIVITY === "true";

  it('should print economy settings', async () => {
    console.log({
      hatchLimitPHT: HATCH_LIMIT_PHT,
      hatchPricePerToken: P0,
      fundingPoolHatchPercentage: THETA / DENOMINATOR_PPM * 100,
      fundingPoolBurnPercentage: FRICTION / DENOMINATOR_PPM * 100,
      artistName: ARTIST_NAME,
      artistSymbol: ARTIST_SYMBOL,
      buyers: BUYERS,
      buyerCapitalPHT: BUYER_CAPITAL_PHT,
      sellerRatio: SELLER_RATIO,
      sellerAmountRatio: SELLER_AMOUNT_RATIO,
    });
  });

  it('should deploy a new ArtistToken', async () => {
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
      HATCH_LIMIT_WEI,
      fundingPool.address,
      FRICTION,
      DURATION,
      HATCH_LIMIT_PHT,
      { from: lsAcc, gas: 10000000 }
    );

    artistTokenSymbol = await artistToken.symbol.call();
  });

  it("should have a Hatcher with positive wPHT(PHT20) balance ready", async () => {
    await wPHT.deposit({
      from: hatcher,
      value: HATCH_LIMIT_WEI
    });

    const hatcherWPHTBalance = await wPHT.balanceOf(hatcher);

    assert.equal(hatcherWPHTBalance.toString(), HATCH_LIMIT_WEI.toString());
  });

  it("should be in a 'hatching phase' after deployed", async () => {
    const isHatched = await artistToken.isHatched();

    assert.isFalse(isHatched);
  });

  it('should end the hatching phase by contributing configured minimum amount to raise from a Hatcher', async () => {
    await wPHT.approve(artistToken.address, HATCH_LIMIT_WEI, {from: hatcher});
    await artistToken.hatchContribute(HATCH_LIMIT_WEI, {from: hatcher});
    let isHatched = await artistToken.isHatched();

    assert.isTrue(isHatched);
  });

  it('should simulate configured market activity from .env file and print economy state', async () => {
    await wPHT.deposit({ from: buyer1, value: BUYER_CAPITAL_WEI });
    await wPHT.approve(artistToken.address, BUYER_CAPITAL_WEI, {from: buyer1});
    await artistToken.mint(BUYER_CAPITAL_WEI, {from: buyer1, gasPrice: GAS_PRICE_WEI});

    const buyer1ArtistTokensBalance = await artistToken.balanceOf(buyer1);

    console.log(`Buyer1:`);
    console.log(` purchased ${wei2pht(buyer1ArtistTokensBalance)} ${artistTokenSymbol} for ${BUYER_CAPITAL_PHT} WPHT worth ${pht2euro(BUYER_CAPITAL_PHT)}€`);

    const buyersArtistTokens = [];
    buyersArtistTokens[0] = buyer1ArtistTokensBalance;

    for (let buyerIndex = 1; buyerIndex < BUYERS; buyerIndex++) {
      const curBalance = await artistToken.balanceOf(buyerSimulator);

      await wPHT.deposit({ from: buyerSimulator, value: BUYER_CAPITAL_WEI });
      await wPHT.approve(artistToken.address, BUYER_CAPITAL_WEI, {from: buyerSimulator});
      await artistToken.mint(BUYER_CAPITAL_WEI, {from: buyerSimulator, gasPrice: GAS_PRICE_WEI});

      const newBalance = await artistToken.balanceOf(buyerSimulator);
      const purchasedAmount = newBalance.sub(curBalance);

      buyersArtistTokens[buyerIndex] = purchasedAmount;

      if (PRINT_MARKET_ACTIVITY) {
        console.log(`Buyer${buyerIndex + 1}:`);
        console.log(` purchased ${wei2pht(purchasedAmount)} ${artistTokenSymbol} for ${BUYER_CAPITAL_PHT} WPHT worth ${pht2euro(BUYER_CAPITAL_PHT)}€`);
      }

      const sellerDelta = Math.round(BUYERS / SELLERS);
      if (buyerIndex % sellerDelta === 0) {
        const curBalance = await wPHT.balanceOf(buyerSimulator);
        const sellerIndex = (buyerIndex - sellerDelta) + 1;
        const sellAmount = pht2wei(wei2pht(buyersArtistTokens[sellerIndex]) * SELLER_AMOUNT_RATIO);

        await artistToken.burn(sellAmount, {from: buyerSimulator, gasPrice: GAS_PRICE_WEI});

        const newBalance = await wPHT.balanceOf(buyerSimulator);
        const revenue = newBalance.sub(curBalance);

        if (PRINT_MARKET_ACTIVITY) {
          console.log(`Buyer${sellerIndex + 1}:`);
          console.log(` sold ${wei2pht(sellAmount)} ${artistTokenSymbol} for ${wei2pht(revenue)} WPHT worth ${wei2euro(revenue)}€`);
        }
      }
    }

    await wPHT.deposit({ from: lastBuyer, value: BUYER_CAPITAL_WEI });
    await wPHT.approve(artistToken.address, BUYER_CAPITAL_WEI, {from: lastBuyer});
    await artistToken.mint(BUYER_CAPITAL_WEI, {from: lastBuyer, gasPrice: GAS_PRICE_WEI});

    const lastBuyerArtistTokensBalance = await artistToken.balanceOf(lastBuyer);

    console.log(`Buyer${BUYERS}:`);
    console.log(` purchased ${wei2pht(lastBuyerArtistTokensBalance)} ${artistTokenSymbol} for ${BUYER_CAPITAL_PHT} WPHT worth ${pht2euro(BUYER_CAPITAL_PHT)}€`);

    await artistToken.burn(buyer1ArtistTokensBalance, {from: buyer1, gasPrice: GAS_PRICE_WEI});
    const postBurnBuyer1TokenWPHTBalance = await wPHT.balanceOf(buyer1);

    console.log(`Buyer1:`);
    console.log(` sold ${wei2pht(buyer1ArtistTokensBalance)} ${artistTokenSymbol} for ${wei2pht(postBurnBuyer1TokenWPHTBalance)} WPHT worth ${wei2euro(postBurnBuyer1TokenWPHTBalance)}€`);
    console.log(` gained ${calcPercentageIncrease(BUYER_CAPITAL_PHT, wei2pht(postBurnBuyer1TokenWPHTBalance))}% in profit`);

    const fundingPoolWPHTBalance = await wPHT.balanceOf(fundingPool.address);
    const artistTokenWPHTBalance = await wPHT.balanceOf(artistToken.address);
    const artistTokenTotalSupply = await artistToken.totalSupply();

    console.log(`Artist:`);
    console.log(` - hatch limit ${HATCH_LIMIT_PHT} WPHT worth ${pht2euro(HATCH_LIMIT_PHT)}€ reached`);
    console.log(` - has ${wei2pht(fundingPoolWPHTBalance)} WPHT worth ${wei2euro(fundingPoolWPHTBalance)}€ in disposition to spend on equipment, etc from the funding pool`);
    console.log(` - total supply of his economy is ${wei2pht(artistTokenTotalSupply)} ${artistTokenSymbol}`);
    console.log(` - total size of his economy is ${wei2pht(artistTokenWPHTBalance)} WPHT worth ${wei2euro(artistTokenWPHTBalance)}€`);
  });
});
