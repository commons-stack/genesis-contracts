const { ether } = require('openzeppelin-test-helpers');

module.exports.pht2wei = (value) => {
  return ether(value.toString());
};

module.exports.wei2pht = (n) => {
  return web3.utils.fromWei(n, 'ether');
};

module.exports.calcPercentageIncrease = (before, after) => {
  return ((after - before) / before) * 100.0;
};
