// import { expect } from 'chai'
const ConvictionVoting = artifacts.require('ConvictionVoting')
const ERC20Mintable = artifacts.require('ERC20Mintable')

// import moment from 'moment'
// import lkTestHelpers from 'lk-test-helpers'
// import { web3 } from './helpers/w3'

// const { accounts } = web3.eth
// const { increaseTime, latestTime } = lkTestHelpers(web3)

const BONUS_PERCENTAGE = 15
const MULTIPLIER = (10 ** 18)
const AMOUNT_PURCHASED = 100

contract('ConvictionVoting', (accounts) => {
  let token, voting

  beforeEach(async () => {
    token = await ERC20Mintable.new()
    voting = await ConvictionVoting.new(token.address)
    await token.mint(accounts[0], 50)
  })

  it('initializes', async () => {
    await voting.addProposal(600, 1)
    await voting.addProposal(1000, 2)

    let prop = await voting.getProposal(1)
    console.log(prop)

    await voting.stakeToProposal(1, 5)

    await voting.stakeToProposal(1, 5)

    await voting.stakeToProposal(1, 5)

    await voting.stakeToProposal(1, 5)

    await voting.stakeToProposal(1, 5)

    await voting.stakeToProposal(1, 5)

    throw('err')
  })
})

async function mine (durationSeconds) {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send({
      jsonrpc: '2.0',
      method: 'evm_mine',
      // params: [durationSeconds],
      id: Date.now(),
    }, (err, resp) => {
      if (err) {
        return reject(err)
      }

      resolve()
    })
  })
}
