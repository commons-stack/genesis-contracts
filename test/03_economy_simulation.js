/**
 * User: llukac<lukas@lightstreams.io>
 * Date: 28/10/19 14:44
 * Copyright 2019 (c) Lightstreams, Granada
 */

require('dotenv').config({ path: `${process.env.PWD}/.env` });

const { BN } = require('openzeppelin-test-helpers');
const { pht2wei, wei2pht, pht2euro, wei2euro, calcPercentageIncrease } = require('./utils');

const FundingPool = artifacts.require("FundingPool.sol");
const WPHT = artifacts.require("WPHT.sol");
const ArtistToken = artifacts.require("ArtistToken.sol");

contract("EconomySimulation", ([lsAcc, artist, artistAccountant, superHatcher, hatcherSimulator, buyer1, buyerSimulator, lastBuyer]) => {
  let fundingPool;
  let wPHT;
  let artistToken;
  let artistTokenSymbol;

  const HATCH_LIMIT_PHT = process.env.HATCH_LIMIT_PHT;
  const HATCH_LIMIT_WEI = pht2wei(HATCH_LIMIT_PHT);
  const SUPER_HATCHER_CAPITAL_PHT = process.env.SUPER_HATCHER_CAPITAL_PHT;
  const SUPER_HATCHER_CAPITAL_WEI = pht2wei(SUPER_HATCHER_CAPITAL_PHT);
  const AVERAGE_HATCHER_CAPITAL_PHT = process.env.AVERAGE_HATCHER_CAPITAL_PHT;
  const AVERAGE_HATCHER_CAPITAL_WEI = pht2wei(AVERAGE_HATCHER_CAPITAL_PHT);
  const HATCHER_SIMULATOR_DEPOSIT_WEI = HATCH_LIMIT_WEI.sub(SUPER_HATCHER_CAPITAL_WEI);
  const TOTAL_HATCHERS = ((HATCH_LIMIT_PHT - SUPER_HATCHER_CAPITAL_PHT) / AVERAGE_HATCHER_CAPITAL_PHT) + 1;
  const SUPER_HATCHERS = 1;
  const AVERAGE_HATCHERS = TOTAL_HATCHERS - SUPER_HATCHERS;

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

  const ARTIST_FUNDING_POOL_WITHDRAW_RATIO = parseFloat(process.env.ARTIST_FUNDING_POOL_WITHDRAW_RATIO);
  const HATCHER_SELL_RATIO = parseFloat(process.env.HATCHER_SELL_RATIO);

  const PRINT_MARKET_ACTIVITY = process.env.PRINT_MARKET_ACTIVITY === "true";

  it('should print economy settings', async () => {
    console.log({
      hatchLimitPHT: HATCH_LIMIT_PHT,
      hatchLimitEuro: pht2euro(HATCH_LIMIT_PHT) + "€",
      superHatcherCapitalPHT: SUPER_HATCHER_CAPITAL_PHT,
      superHatcherCapitalEuro: pht2euro(SUPER_HATCHER_CAPITAL_PHT) + "€",
      averageHatcherCapitalPHT: AVERAGE_HATCHER_CAPITAL_PHT,
      averageHatcherCapitalEuro: pht2euro(AVERAGE_HATCHER_CAPITAL_PHT) + "€",
      superHatchers: SUPER_HATCHERS,
      averageHatchers: AVERAGE_HATCHERS,
      totalHatchers: TOTAL_HATCHERS,
      hatchPricePerToken: P0,
      fundingPoolHatchPercentage: (THETA / DENOMINATOR_PPM * 100) + "%",
      fundingPoolBurnPercentage: (FRICTION / DENOMINATOR_PPM * 100) + "%",
      artistName: ARTIST_NAME,
      artistSymbol: ARTIST_SYMBOL,
      buyers: BUYERS,
      buyerCapitalPHT: BUYER_CAPITAL_PHT,
      buyerCapitalEuro: pht2euro(BUYER_CAPITAL_PHT) + "€",
      sellerRatio: SELLER_RATIO,
      sellerAmountRatio: SELLER_AMOUNT_RATIO,
      artistFundingPoolWithdrawPercentage: (ARTIST_FUNDING_POOL_WITHDRAW_RATIO * 100) + "%",
      hatcherSellPercentage: (HATCHER_SELL_RATIO * 100) + "%",
    });
  });

  it('should deploy a new ArtistToken', async () => {
    fundingPool = await FundingPool.new({ from: artist });
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
      { from: artist, gas: 10000000 }
    );

    artistTokenSymbol = await artistToken.symbol.call();
  });

  it("should have hatchers with positive wPHT(PHT20) balances ready", async () => {
    await wPHT.deposit({
      from: hatcherSimulator,
      value: HATCHER_SIMULATOR_DEPOSIT_WEI
    });

    await wPHT.deposit({
      from: superHatcher,
      value: SUPER_HATCHER_CAPITAL_WEI
    });

    const hatcherSimulatorWPHTBalance = await wPHT.balanceOf(hatcherSimulator);
    const superHatcherWPHTBalance = await wPHT.balanceOf(superHatcher);

    assert.equal(hatcherSimulatorWPHTBalance.toString(), HATCHER_SIMULATOR_DEPOSIT_WEI.toString());
    assert.equal(superHatcherWPHTBalance.toString(), SUPER_HATCHER_CAPITAL_WEI.toString());
  });

  it("should be in a 'hatching phase' after deployed", async () => {
    const isHatched = await artistToken.isHatched();

    assert.isFalse(isHatched);
  });

  it('should end the hatching phase by contributing configured minimum amount to raise from hatchers', async () => {
    await wPHT.approve(artistToken.address, HATCHER_SIMULATOR_DEPOSIT_WEI, {from: hatcherSimulator});
    await artistToken.hatchContribute(HATCHER_SIMULATOR_DEPOSIT_WEI, {from: hatcherSimulator});

    await wPHT.approve(artistToken.address, SUPER_HATCHER_CAPITAL_WEI, {from: superHatcher});
    await artistToken.hatchContribute(SUPER_HATCHER_CAPITAL_WEI, {from: superHatcher});
    let isHatched = await artistToken.isHatched();

    assert.isTrue(isHatched);
  });

  it('should simulate configured market activity from .env file and print economy state', async () => {
    if (BUYERS === 0) {
      console.log("No post-hatch buying simulation is happening because BUYERS setting is set to 0");
      return;
    }

    await wPHT.deposit({ from: buyer1, value: BUYER_CAPITAL_WEI });
    await wPHT.approve(artistToken.address, BUYER_CAPITAL_WEI, {from: buyer1});
    await artistToken.mint(BUYER_CAPITAL_WEI, {from: buyer1, gasPrice: GAS_PRICE_WEI});

    const buyer1ArtistTokensBalance = await artistToken.balanceOf(buyer1);

    console.log(`Buyer1:`);
    console.log(` purchased ${wei2pht(buyer1ArtistTokensBalance)} ${artistTokenSymbol} for ${BUYER_CAPITAL_PHT} WPHT worth ${pht2euro(BUYER_CAPITAL_PHT)}€`);

    const buyersArtistTokens = [];
    buyersArtistTokens[0] = buyer1ArtistTokensBalance;

    for (let buyerIndex = 1; buyerIndex < BUYERS - 1; buyerIndex++) {
      const curBalance = await artistToken.balanceOf(buyerSimulator);

      await wPHT.deposit({ from: buyerSimulator, value: BUYER_CAPITAL_WEI });
      await wPHT.approve(artistToken.address, BUYER_CAPITAL_WEI, {from: buyerSimulator});
      await artistToken.mint(BUYER_CAPITAL_WEI, {from: buyerSimulator, gasPrice: GAS_PRICE_WEI});

      const newBalance = await artistToken.balanceOf(buyerSimulator);
      const purchasedAmount = newBalance.sub(curBalance);

      buyersArtistTokens[buyerIndex] = purchasedAmount;

      if (PRINT_MARKET_ACTIVITY || buyerIndex === 0) {
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

    if (BUYERS > 1) {
      await wPHT.deposit({ from: lastBuyer, value: BUYER_CAPITAL_WEI });
      await wPHT.approve(artistToken.address, BUYER_CAPITAL_WEI, {from: lastBuyer});
      await artistToken.mint(BUYER_CAPITAL_WEI, {from: lastBuyer, gasPrice: GAS_PRICE_WEI});

      const lastBuyerArtistTokensBalance = await artistToken.balanceOf(lastBuyer);

      console.log(`Buyer${BUYERS}:`);
      console.log(` purchased ${wei2pht(lastBuyerArtistTokensBalance)} ${artistTokenSymbol} for ${BUYER_CAPITAL_PHT} WPHT worth ${pht2euro(BUYER_CAPITAL_PHT)}€`);
    }

    if (SELLER_RATIO > 0) {
      await artistToken.burn(buyer1ArtistTokensBalance, {from: buyer1, gasPrice: GAS_PRICE_WEI});
      const postBurnBuyer1TokenWPHTBalance = await wPHT.balanceOf(buyer1);

      console.log(`Buyer1:`);
      console.log(` sold ${wei2pht(buyer1ArtistTokensBalance)} ${artistTokenSymbol} for ${wei2pht(postBurnBuyer1TokenWPHTBalance)} WPHT worth ${wei2euro(postBurnBuyer1TokenWPHTBalance)}€`);
      console.log(` gained ${calcPercentageIncrease(BUYER_CAPITAL_PHT, wei2pht(postBurnBuyer1TokenWPHTBalance))}% in profit`);
    }

    const fundingPoolWPHTBalance = await wPHT.balanceOf(fundingPool.address);
    const artistTokenWPHTBalance = await wPHT.balanceOf(artistToken.address);
    const artistTokenTotalSupply = await artistToken.totalSupply();

    console.log(`Artist:`);
    console.log(` - hatch limit ${HATCH_LIMIT_PHT} WPHT worth ${pht2euro(HATCH_LIMIT_PHT)}€ reached`);
    console.log(` - has ${wei2pht(fundingPoolWPHTBalance)} WPHT worth ${wei2euro(fundingPoolWPHTBalance)}€ in disposition to spend on equipment, etc from the funding pool`);
    console.log(` - total supply of his economy is ${wei2pht(artistTokenTotalSupply)} ${artistTokenSymbol}`);
    console.log(` - total size of his economy is ${wei2pht(artistTokenWPHTBalance)} WPHT worth ${wei2euro(artistTokenWPHTBalance)}€`);
  });

  it('should let an Artist to allocate raised funds from the FundingPool', async () => {
    const wPHTBalance = await wPHT.balanceOf(fundingPool.address);
    const withdrawAmountPHT = wei2pht(wPHTBalance) * ARTIST_FUNDING_POOL_WITHDRAW_RATIO;
    const withdrawAmountWei = pht2wei(withdrawAmountPHT);

    await fundingPool.allocateFunds(artistToken.address, artistAccountant, withdrawAmountWei, { from: artist });

    console.log(`Artist withdrawn ${ARTIST_FUNDING_POOL_WITHDRAW_RATIO * 100}% of tokens, ${withdrawAmountPHT} WPHT, worth ${pht2euro(withdrawAmountPHT)}€ from FundingPool to an external account`);

    const accountantWPHTBalance = await wPHT.balanceOf(artistAccountant);

    assert.equal(accountantWPHTBalance.toString(), withdrawAmountWei.toString());
  });

  it('should let a super hatcher to claim his tokens', async () => {
    const contribution = await artistToken.initialContributions(superHatcher);
    const lockedInternal = contribution.lockedInternal;

    await artistToken.claimTokens({from: superHatcher});

    const balance = await artistToken.balanceOf(superHatcher);

    console.log(`A super hatcher claimed ${wei2pht(balance)} / ${wei2pht(lockedInternal)} ${artistTokenSymbol}`);
  });

  it('should let average hatchers to claim their tokens', async () => {
    const contribution = await artistToken.initialContributions(hatcherSimulator);
    const lockedInternal = contribution.lockedInternal;

    await artistToken.claimTokens({from: hatcherSimulator});

    const balance = await artistToken.balanceOf(hatcherSimulator);

    console.log(`An average hatcher claimed ${wei2pht(balance.div(new BN(AVERAGE_HATCHERS)))} / ${wei2pht(lockedInternal.div(new BN(AVERAGE_HATCHERS)))} ${artistTokenSymbol}`);
  });

  it('should let super hatcher to sell his claimed tokens', async () => {
    if (HATCHER_SELL_RATIO === 0) {
      console.log("No hatchers selling simulation is happening because HATCHER_SELL_RATIO setting is set to 0.0");
      return;
    }

    const wPHTBalance = await wPHT.balanceOf(superHatcher);
    const artistTokensBalance = await artistToken.balanceOf(superHatcher);
    const burnAmountPHT = wei2pht(artistTokensBalance) * HATCHER_SELL_RATIO;
    const burnAmountWei = pht2wei(burnAmountPHT);

    await artistToken.burn(burnAmountWei, {from: superHatcher, gasPrice: GAS_PRICE_WEI});

    const postWPHTBalance = await wPHT.balanceOf(superHatcher);
    const revenue = postWPHTBalance.sub(wPHTBalance);

    console.log(`A super hatcher:`);
    console.log(` sold ${HATCHER_SELL_RATIO * 100}%, ${burnAmountPHT} ${artistTokenSymbol} for ${wei2euro(revenue)}€`);
    console.log(` gained ${calcPercentageIncrease(SUPER_HATCHER_CAPITAL_PHT, wei2pht(revenue))}% in profit`);
  });

  it('should let average hatchers to sell their claimed tokens', async () => {
    if (HATCHER_SELL_RATIO === 0) {
      console.log("No hatchers selling simulation is happening because HATCHER_SELL_RATIO setting is set to 0.0");
      return;
    }

    const wPHTBalance = await wPHT.balanceOf(hatcherSimulator);
    const artistTokensBalance = await artistToken.balanceOf(hatcherSimulator);
    const burnAmountPHT = wei2pht(artistTokensBalance) * HATCHER_SELL_RATIO;
    const burnAmountPHTPerHatcher = burnAmountPHT / AVERAGE_HATCHERS;
    const burnAmountWei = pht2wei(burnAmountPHT);

    await artistToken.burn(burnAmountWei, {from: hatcherSimulator, gasPrice: GAS_PRICE_WEI});

    const postWPHTBalance = await wPHT.balanceOf(hatcherSimulator);
    const revenue = postWPHTBalance.sub(wPHTBalance);
    const revenuePerHatcher = revenue.div(new BN(AVERAGE_HATCHERS));

    console.log(`An average hatcher:`);
    console.log(` sold ${HATCHER_SELL_RATIO * 100}%, ${burnAmountPHTPerHatcher} ${artistTokenSymbol} for ${wei2euro(revenuePerHatcher)}€`);
    console.log(` gained ${calcPercentageIncrease(AVERAGE_HATCHER_CAPITAL_PHT, wei2pht(revenuePerHatcher))}% in profit`);
  });
});
