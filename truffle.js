require("dotenv").config();

const PrivateKeyProvider = require("truffle-privatekey-provider");
const HDWalletProvider = require("truffle-hdwallet-provider");
const mnemonic =
  "hope awesome inherit detect employ busy popular clip olive fork better glare";

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*"
    },
    test: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*"
    },
    rinkeby: {
      provider: () =>
      new PrivateKeyProvider(
        process.env.RINKEBY_KEY,
        `https://rinkeby.infura.io/${process.env.INFURA_KEY}`
      ),
      network_id: 15
    }
  },
  compilers: {
    solc: {
      version: '0.5.2',
      optimizer: {
        enabled: true, // Default: false
        runs: 1000     // Default: 200
      }
    }
  }
};
