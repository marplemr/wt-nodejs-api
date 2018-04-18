/* eslint-env mocha */
/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const fetch = require('node-fetch');
const config = require('../src/config');
const { PASSWORD_HEADER } = require('../src/helpers/validators');

const { app } = require('../src/srv/service');
const lifData = require('@windingtree/lif-token/build/contracts/LifTokenTest.json');

const gasMargin = 1.5;
const addressZero = '0x0000000000000000000000000000000000000000000000000000000000000000';
let index;
let fundingSource;
let daoAccount;
let ownerAccount;
let server;
config.set('web3Provider', 'http://localhost:8545');
config.updateWeb3Provider();

const Before = () => (
  before(async function () {
    config.set('log', false);
    config.set('password', 'test123');
    config.set('privateKeyDir', 'keys/test.json');
    const wallet = await config.get('web3provider').web3.eth.accounts.wallet.create(3);
    const createdAccounts = await config.get('web3provider').web3.eth.getAccounts();
    fundingSource = createdAccounts[0];
    ownerAccount = wallet['0'].address;
    daoAccount = wallet['1'].address;
    config.set('user', wallet['2'].address);
    await config.get('web3provider').accounts.fundAccount(fundingSource, ownerAccount, '50');
    await config.get('web3provider').accounts.fundAccount(fundingSource, daoAccount, '50');
    await config.get('web3provider').accounts.fundAccount(fundingSource, config.get('user'), '50');
  })
);
const BeforeEach = () => (
  beforeEach(async function () {
    config.set('whiteList', ['127.0.0.1']);
    index = await config.get('web3provider').deploy.deployIndex(daoAccount, gasMargin);
    expect(index._address).to.not.equal(addressZero);
    config.set('indexAddress', index._address);
    server = await app.listen(3000);
    await setUpWallet();
    await generateHotel(daoAccount);
    await deployLifContract(daoAccount, config.get('user'), index);
  })
);
const AfterEach = () => (
  afterEach(async function () {
    return server.close();
  })
);

async function generateHotel (ownerAddres) {
  let body, headers;
  let res;
  let hotelAddresses;
  const hotelName = 'Test Hotel';
  const hotelDesc = 'Test Hotel desccription';

  body = JSON.stringify({
    'description': hotelDesc,
    'name': hotelName,
  });
  headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
  headers[PASSWORD_HEADER] = config.get('password');
  res = await fetch('http://localhost:3000/hotels', {
    method: 'POST',
    headers,
    body,
  });

  res = await fetch('http://localhost:3000/hotels', {
    method: 'GET',
    headers,
  });

  const hotels = await res.json();
  hotelAddresses = Object.keys(hotels);
  config.set('testAddress', hotelAddresses[0]);
  const hotel = hotels[hotelAddresses[0]];
  expect(hotel).to.have.property('name', hotelName);
  expect(hotel).to.have.property('description', hotelDesc);
}

async function setUpWallet () {
  const wallet = await config.get('web3provider').web3.eth.accounts.wallet[0].encrypt(config.get('password'));
  const body = JSON.stringify({
    wallet,
  });
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
  headers[PASSWORD_HEADER] = config.get('password');
  await fetch('http://localhost:3000/wallet', {
    method: 'POST',
    headers,
    body,
  });
}

async function deployLifContract (deployerAccount, user) {
  const web3 = config.get('web3provider').web3;
  const lifContract = new web3.eth.Contract(lifData.abi);
  const lifTokenInstance = await lifContract.deploy({
    data: lifData.bytecode,
    arguments: [],
  }).send({
    from: deployerAccount,
    gas: 5000000,
    gasPrice: 1,
  });
  lifContract.options.address = lifTokenInstance._address;
  config.set('tokenAddress', lifTokenInstance._address);
  let faucetLifData = lifContract.methods.faucetLif().encodeABI();
  await web3.eth.sendTransaction({
    from: user,
    to: lifContract.options.address,
    data: faucetLifData,
    gas: 5000000,
  });
  const balance = await lifContract.methods.balanceOf(user).call({ from: user });
  expect(balance).to.eql('50000000000000000000');

  const setLifData = await index.methods
    .setLifToken(lifContract.options.address)
    .encodeABI();

  const setLifOptions = {
    from: deployerAccount,
    to: index.options.address,
    gas: 5000000,
    data: setLifData,
  };

  await web3.eth.sendTransaction(setLifOptions);
}

module.exports = {
  AfterEach,
  BeforeEach,
  Before,
};
