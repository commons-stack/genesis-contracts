const { BN, constants, expectEvent, shouldFail } = require('openzeppelin-test-helpers');


const CommonsToken = artifacts.require("CommonsToken.sol");
const FundingPoolMock = artifacts.require("FundingPoolMock.sol");
const ReserveTokenMock = artifacts.require("./contracts/vendor/ERC20/ERC20Mintable.sol");

const DENOMINATOR_PPM = 1000000;
contract("CommonsToken", ([externalTokenMinter, contractCreator, hatcherOne, hatcherTwo, lateInvestor]) => {
  const reserveRatio = 142857; // kappa ~ 6
  const theta = 350000; // 35% in ppm
  const p0 =  1;
  const initialRaise = 300000;
  const friction = 20000; // 2% in ppm
  const gasPrice = 15000000000; // 15gwei
  const duration = 604800; // 1 week in seconds
  const minimalContribution = 100 // in xDai

  beforeEach(async function() {
    this.fundingPool = await FundingPoolMock.new();
    this.externalToken = await ReserveTokenMock.new(externalTokenMinter);
    this.commonsToken = await CommonsToken.new(
      this.externalToken.address,
      reserveRatio,
      gasPrice,
      theta,
      p0,
      initialRaise,
      this.fundingPool.address,
      friction,
      duration,
      minimalContribution,
      { gas: 10000000 }
    );
    await this.externalToken.mint(hatcherOne, 1000000);
    await this.externalToken.mint(hatcherTwo, 1000000);
  })

  describe('hatchContribute', function () {
    describe('When we are in the hatch phase', function() {
      describe("When we are within the duration deadline", function() {
        describe('When the contribution does not reach the initialRaise', function() {
          const amountToFundExtern = 200;
          describe("When there is sufficient contribution", function() {
            describe('When the commonToken can pull the external token', function() {
              beforeEach(async function() {
                // problem. The msg.sender is the smart contract.
                await this.externalToken.approve(this.commonsToken.address, amountToFundExtern, {from: hatcherOne});
                await this.commonsToken.hatchContribute(amountToFundExtern, {from: hatcherOne});
              })

              it("Should have increased the total amount raised", async function() {
                let raisedExternal = await this.commonsToken.raisedExternal()
                assert.equal(raisedExternal, amountToFundExtern);
              })

              it("Should have allocated the external tokens to the bonding curve", async function() {
                let externalTokensOwned = await this.externalToken.balanceOf(this.commonsToken.address);
                assert.equal(externalTokensOwned, amountToFundExtern);
              })

              it("Should have set the initial external contributions for the hatcher", async function() {
                let initialContributions = await this.commonsToken.initialContributions(hatcherOne);
                let paidExternal = initialContributions.paidExternal;
                assert.equal(paidExternal, amountToFundExtern);
              })

              it("Should have set the locked internal tokens for the hatcher", async function() {
                let initialContributions = await this.commonsToken.initialContributions(hatcherOne);
                let lockedInternal = initialContributions.lockedInternal;
                assert.equal(lockedInternal, amountToFundExtern * p0);
              })
            })
            describe("When the commonToken cannot pull the reserve token", async function() {
              it('reverts', async function() {
                await shouldFail.reverting(this.commonsToken.hatchContribute(amountToFundExtern, {from: hatcherOne}))
              })
            })
          })
          describe("When there is no sufficient contribution", function() {
            const amountToFundExtern = 1
            it('reverts', async function() {
              await shouldFail.reverting(this.commonsToken.hatchContribute(amountToFundExtern, {from: hatcherOne}))
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
          const amountToFundExtern = 400000;
          beforeEach(async function() {
            await this.externalToken.approve(this.commonsToken.address, amountToFundExtern, {from: hatcherOne});
            await this.commonsToken.hatchContribute(amountToFundExtern, {from: hatcherOne});
          })

          it("Should have increased the total amount raised", async function() {
            let raisedExternal = await this.commonsToken.raisedExternal()
            assert.equal(raisedExternal, initialRaise);
          })

          it("Should have allocated the external tokens to the bonding curve", async function() {
            let expectedAmountOfExternalTokens = (DENOMINATOR_PPM - theta) * initialRaise / DENOMINATOR_PPM
            let externalTokensOwned = await this.externalToken.balanceOf(this.commonsToken.address);
            assert.equal(externalTokensOwned, expectedAmountOfExternalTokens);
          })

          it("Should have set the initial external contributions for the hatcher", async function() {
            let initialContributions = await this.commonsToken.initialContributions(hatcherOne);
            let paidExternal = initialContributions.paidExternal;
            assert.equal(paidExternal, initialRaise);
          })

          it("Should have send the correct amount of external tokens to the fundingPool", async function() {

            let externalTokensInFundingPool = await this.externalToken.balanceOf(this.fundingPool.address);
            assert.equal(externalTokensInFundingPool, initialRaise * theta  / DENOMINATOR_PPM);
          })

          it("Should have minted the correct amount to the bonding curve contract", async function() {
            let internalTokensInBondingCurve = await this.commonsToken.balanceOf(this.commonsToken.address);
            assert.equal(internalTokensInBondingCurve, (initialRaise / p0 ) * (1 - (theta  / DENOMINATOR_PPM)));
          })

          it("Should have ended the hatching phase", async function() {
            let isHatched = await this.commonsToken.isHatched();
            assert.isTrue(isHatched);
          })
        })
      })
      describe("When we are outside the duration deadline", function() {
        // do something with the time
      })
    })
    describe("When we are not in the hatch phase", function() {
      const amountToFundExtern = 400000;
      beforeEach(async function() {
        // problem. The msg.sender is the smart contract.
        await this.externalToken.approve(this.commonsToken.address, amountToFundExtern, {from: hatcherOne});
        await this.commonsToken.hatchContribute(amountToFundExtern, {from: hatcherOne});
      })
      it('reverts', async function() {
        await shouldFail.reverting(this.commonsToken.hatchContribute(amountToFundExtern, {from: hatcherOne}))
      })
    })
  });

  describe("fundsAllocated", function() {
    describe("When the sender is the fundingPool", function() {
      describe("When we have not yet allocated all the initial funds", function() {
        describe("When we don't allocate all the initial funds", function() {
          //const toAllocate
          //totalUnlocked increases to less than 100%
        })
        describe("When we allocate all the initial funds", function() {
          //totalUnlocked 100%
        })
        describe("When we allocate more than the initial funds", function() {
          //totalUnlocked 100%
        })
      })
    })
    describe("When the sender is not the fundingPool", function() {
      //reverts

    })
  })

  describe("burn", function() {
    describe("When we are not in the hatching phase", function() {
      describe("When the callee has enough internal tokens", function() {
        // burn tokens
        // transfer 1-friction to the callee in external token to the callee
        // transfer fridction to the funding pool
      })
      describe("When the callee has not enough internal tokens", function() {
        //revert
      })
    })

    describe("When we are in the hatchin phase", function() {
      //reverts
    })
  })

  describe("mint", function() {
    describe("when we are not in the hatching phase", function() {


    })
    describe("When we are in the hatching phase", function() {

    })
  })
})
