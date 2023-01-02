const ethers = require("ethers");

const erc20Abi = [
  // Read-Only Functions
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",

  // Authenticated Functions
  "function transfer(address to, uint amount) returns (bool)",

  // Events
  "event Transfer(address indexed from, address indexed to, uint amount)",
];

/**
 *
 * @param {string} address ERC20 Contract Address
 * @param {ethers.providers.JsonRpcProvider} provider Ethers JSON PRC Provider
 * @returns
 */
const getErc20Contract = (address, provider) =>
  new ethers.Contract(address, erc20Abi, provider);

const distributorAbi = [
  // Authenticated Functions
  "function distribute(address[] receivers, uint256 amountPerReceiver) public payable",
  // Events
  "event Distribute(address from, uint256 amount, address[] receivers)",
];

const getDistributorContract = (address, provider) =>
  new ethers.Contract(address, distributorAbi, provider);
module.exports = {
  getErc20Contract,
  getDistributorContract,
};
