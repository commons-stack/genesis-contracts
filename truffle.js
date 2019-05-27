require("dotenv").config();

const HDWalletProvider = require('truffle-hdwallet-provider')

const SolcStableVersion = '0.5.7'

module.exports = {
  networks: {
    //
    // Local networks:
    //

    // Local development (default):
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*"
    },

    // Local test (default):
    test: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*"
    },

    //
    // Test networks:
    //

    // Ethereum Rinkeby testnet:
    rinkeby: {
      provider: () =>
        new HDWalletProvider(
          process.env.RINKEBY_MNEMONIC,
          `https://rinkeby.infura.io/${process.env.INFURA_KEY}`
        ),
      network_id: 15
    },

    // PoA Sokol testnet:
    sokol: {
      provider: () =>
        new HDWalletProvider(
          process.env.SOKOL_MNEMONIC,
          "https://sokol.poa.network"
        ),
      network_id: 77,
      gas: 500000,
      gasPrice: 1000000000
    }
  },
  compilers: {
    solc: {
      version: SolcStableVersion,
      optimizer: {
        enabled: true, // Default: false
        runs: 1000     // Default: 200
      }
    }
  }
};
