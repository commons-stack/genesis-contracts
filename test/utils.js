require('dotenv').config({ path: `${process.env.PWD}/.env` });

const { ether } = require('openzeppelin-test-helpers');

module.exports.pht2wei = (value) => {
  return ether(value.toString());
};

const wei2pht = (n) => {
  return web3.utils.fromWei(n, 'ether');
};
module.exports.wei2pht = wei2pht;

module.exports.pht2euro = (photons) => {
  return parseFloat(photons * process.env.PHT_PRICE_EURO).toFixed(2);
};

module.exports.wei2euro = (photons) => {
  return parseFloat(wei2pht(photons) * process.env.PHT_PRICE_EURO).toFixed(2);
};

module.exports.calcPercentageIncrease = (before, after) => {
  return ((after - before) / before) * 100.0;
};
