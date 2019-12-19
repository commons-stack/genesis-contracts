const { BN, constants, expectEvent, shouldFail, ether } = require('openzeppelin-test-helpers');

const pht2wei = (value) => {
  return ether(value.toString());
};

const FundingPool = artifacts.require("FundingPool.sol");
const WPHT = artifacts.require("WPHT.sol");
const ArtistToken = artifacts.require("ArtistToken.sol");

const DENOMINATOR_PPM = 1000000;
contract("ArtistToken", ([lightstreams, hatcher1, hatcher2, lateInvestor]) => {
  let fundingPool;
  let wPHT;
  let artistToken;

  const INIT_HATCHER_WPHT_BALANCE_PHT = 20000;
  const AMOUNT_TO_RAISE_PHT = 10000;
  const MIN_REQUIRED_HATCHER_CONTRIBUTION_PHT = 100;
  const EXCEEDED_AMOUNT_TO_RAISE_PHT = AMOUNT_TO_RAISE_PHT + 1;
  const INSUFFICIENT_AMOUNT_TO_RAISE_PHT = AMOUNT_TO_RAISE_PHT / 100;
  const INSUFFICIENT_CONTRIBUTION_PHT = MIN_REQUIRED_HATCHER_CONTRIBUTION_PHT - 1;

  const INIT_HATCHER_WPHT_BALANCE_WEI = pht2wei(INIT_HATCHER_WPHT_BALANCE_PHT);
  const AMOUNT_TO_RAISE_WEI = pht2wei(AMOUNT_TO_RAISE_PHT);
  const MIN_REQUIRED_HATCHER_CONTRIBUTION_WEI = pht2wei(MIN_REQUIRED_HATCHER_CONTRIBUTION_PHT);
  const EXCEEDED_AMOUNT_TO_RAISE_WEI = pht2wei(EXCEEDED_AMOUNT_TO_RAISE_PHT);
  const INSUFFICIENT_AMOUNT_TO_RAISE_WEI = pht2wei(INSUFFICIENT_AMOUNT_TO_RAISE_PHT);
  const INSUFFICIENT_CONTRIBUTION_WEI = pht2wei(INSUFFICIENT_CONTRIBUTION_PHT);

  const RESERVE_RATIO = 142857; // kappa ~ 6
  const THETA = 350000; // 35% in ppm
  const P0 =  1;
  const FRICTION = 20000; // 2% in ppm
  const GAS_PRICE_WEI = 15000000000; // 15 gwei
  const HATCH_DURATION_SECONDS = 3024000; // 5 weeks
  const HATCH_VESTING_DURATION_SECONDS = 0; // 0 seconds

  beforeEach(async function() {
    fundingPool = await FundingPool.new();
    wPHT = await WPHT.new();

    artistToken = await ArtistToken.new(
      "Armin Van Lightstreams",
      "AVL",
      [wPHT.address, fundingPool.address, fundingPool.address, lightstreams],
      [GAS_PRICE_WEI, THETA, P0, AMOUNT_TO_RAISE_WEI, FRICTION, HATCH_DURATION_SECONDS, HATCH_VESTING_DURATION_SECONDS, MIN_REQUIRED_HATCHER_CONTRIBUTION_WEI],
      RESERVE_RATIO,
      { from: lightstreams, gas: 10000000 }
    );

    await wPHT.deposit({
      from: hatcher1,
      value: INIT_HATCHER_WPHT_BALANCE_WEI
    });

    await wPHT.deposit({
      from: hatcher2,
      value: INIT_HATCHER_WPHT_BALANCE_WEI
    });
  });

  describe('Initial State', () => {
    describe('When new ArtistToken is just deployed', () => {
      it("Should have no tokens created", async () => {
        let raisedExternal = await artistToken.raisedExternal();

        assert.equal(raisedExternal, 0);
      });

      it("Should have Hatchers with positive wPHT(PHT20) balances ready", async () => {
        const hatcher1WPHTBalance = await wPHT.balanceOf(hatcher1);
        const hatcher2WPHTBalance = await wPHT.balanceOf(hatcher2);

        assert.equal(hatcher1WPHTBalance.toString(), INIT_HATCHER_WPHT_BALANCE_WEI.toString());
        assert.equal(hatcher2WPHTBalance.toString(), INIT_HATCHER_WPHT_BALANCE_WEI.toString());
      });
    });
  });

  describe('Hatching', function () {
    describe('When we are in the hatch phase', function() {
      describe("When we are within the DURATION deadline", function() {
        describe('When the contribution does not reach the AMOUNT_TO_RAISE_PHT', function() {

          describe("When there is sufficient contribution", function() {
            describe('When the ArtistToken can pull the external token', function() {
              beforeEach(async function() {
                await wPHT.approve(artistToken.address, INSUFFICIENT_AMOUNT_TO_RAISE_WEI, {from: hatcher1});
                await artistToken.hatchContribute(INSUFFICIENT_AMOUNT_TO_RAISE_WEI, {from: hatcher1});
              });

              it("Should have increased the total amount raised", async function() {
                let raisedExternal = await artistToken.raisedExternal();
                assert.equal(raisedExternal.toString(), INSUFFICIENT_AMOUNT_TO_RAISE_WEI.toString());
              });

              it("Should have allocated the external tokens to the bonding curve", async function() {
                let externalTokensOwned = await wPHT.balanceOf(artistToken.address);
                assert.equal(externalTokensOwned.toString(), INSUFFICIENT_AMOUNT_TO_RAISE_WEI.toString());
              })

              it("Should have set the initial external contributions for the hatcher", async function() {
                let initialContributions = await artistToken.initialContributions(hatcher1);
                let paidExternal = initialContributions.paidExternal;
                assert.equal(paidExternal.toString(), INSUFFICIENT_AMOUNT_TO_RAISE_WEI.toString());
              })

              it("Should have set the locked internal tokens for the hatcher", async function() {
                let initialContributions = await artistToken.initialContributions(hatcher1);
                let lockedInternal = initialContributions.lockedInternal;
                assert.equal(lockedInternal.toString(), (INSUFFICIENT_AMOUNT_TO_RAISE_WEI * P0).toString());
              })
            })
            describe("When the ArtistToken cannot pull the reserve token", async function() {
              it('reverts', async function() {
                await shouldFail.reverting(artistToken.hatchContribute(INSUFFICIENT_AMOUNT_TO_RAISE_WEI, {from: hatcher1}))
              })
            })
          })
          describe("When there is no sufficient contribution", function() {
            it('reverts', async function() {
              await shouldFail.reverting(artistToken.hatchContribute(INSUFFICIENT_CONTRIBUTION_WEI, {from: hatcher1}))
            })
          })
        })
        describe("When the contribution reaches the initial raise", function() {
          // increase raised
          // pull reservetoken from the contributer to our account
          // set the initialContributions for the hatcher
          // mint bonding curve tokens to the bondingcurve contract
        })
        describe("When the contribution reaches over the initial raise", function() {
          beforeEach(async function() {
            await wPHT.approve(artistToken.address, EXCEEDED_AMOUNT_TO_RAISE_WEI, {from: hatcher1});
            await artistToken.hatchContribute(EXCEEDED_AMOUNT_TO_RAISE_WEI, {from: hatcher1});
          })

          it("Should have increased the total amount raised", async function() {
            let raisedExternal = await artistToken.raisedExternal()
            assert.equal(raisedExternal.toString(), AMOUNT_TO_RAISE_WEI.toString());
          })

          it("Should have allocated the external tokens to the bonding curve", async function() {
            let expectedAmountOfExternalTokens = pht2wei((DENOMINATOR_PPM - THETA) * AMOUNT_TO_RAISE_PHT / DENOMINATOR_PPM)
            let externalTokensOwned = await wPHT.balanceOf(artistToken.address);
            assert.equal(externalTokensOwned.toString(), expectedAmountOfExternalTokens.toString());
          })

          it("Should have set the initial external contributions for the hatcher", async function() {
            let initialContributions = await artistToken.initialContributions(hatcher1);
            let paidExternal = initialContributions.paidExternal;
            assert.equal(paidExternal.toString(), AMOUNT_TO_RAISE_WEI.toString());
          })

          it("Should have send the correct amount of external tokens to the fundingPool", async function() {
            let externalTokensInFundingPool = await wPHT.balanceOf(fundingPool.address);
            assert.equal(externalTokensInFundingPool.toString(), pht2wei(AMOUNT_TO_RAISE_PHT * THETA  / DENOMINATOR_PPM).toString());
          })

          it("Should have minted the correct amount to the bonding curve contract", async function() {
            let internalTokensInBondingCurve = await artistToken.balanceOf(artistToken.address);
            assert.equal(internalTokensInBondingCurve.toString(), pht2wei((AMOUNT_TO_RAISE_PHT / P0 ) * (1 - (THETA  / DENOMINATOR_PPM))).toString());
          })

          it("Should have ended the hatching phase", async function() {
            let isHatched = await artistToken.isHatched();
            assert.isTrue(isHatched);
          })

          it("Should not be possible to hatchContribute anymore", async function() {
            await shouldFail.reverting(artistToken.hatchContribute(MIN_REQUIRED_HATCHER_CONTRIBUTION_WEI, {from: hatcher1}))
          })
        })
    })
      describe("When we are outside the DURATION deadline", function() {
        // do something with the time
      })
    })
  });

  // describe("fundsAllocated", function() {
  //   describe("When the sender is the fundingPool", function() {
  //     describe("When we have not yet allocated all the initial funds", function() {
  //       describe("When we don't allocate all the initial funds", function() {
  //         //const toAllocate
  //         //totalUnlocked increases to less than 100%
  //       })
  //       describe("When we allocate all the initial funds", function() {
  //         //totalUnlocked 100%
  //       })
  //       describe("When we allocate more than the initial funds", function() {
  //         //totalUnlocked 100%
  //       })
  //     })
  //   })
  //   describe("When the sender is not the fundingPool", function() {
  //     //reverts
  //
  //   })
  // })

  // describe("burn", function() {
  //   describe("When we are not in the hatching phase", function() {
  //     describe("When the callee has enough internal tokens", function() {
  //       // burn tokens
  //       // transfer 1-FRICTION to the callee in external token to the callee
  //       // transfer fridction to the funding pool
  //     })
  //     describe("When the callee has not enough internal tokens", function() {
  //       //revert
  //     })
  //   })
  //
  //   describe("When we are in the hatchin phase", function() {
  //     //reverts
  //   })
  // })

  // describe("mint", function() {
  //   describe("when we are not in the hatching phase", function() {
  //
  //
  //   })
  //   describe("When we are in the hatching phase", function() {
  //
  //   })
  // })
})
