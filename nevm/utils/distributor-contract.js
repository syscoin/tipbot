const config = require("../../config.json");
const { ethers } = require("ethers");
const { getDistributorContract } = require("./contract");
/**
 *
 * @param {string[]} addressList
 * @param {ethers.ethers.BigNumber} amountPerReceiver
 * @param {ethers.ethers.BigNumber} value To be sent to contract
 * @param {ethers.ethers.providers.JsonRpcProvider} jsonProvider
 */
const generateDistributeFundsTransaction = async (
  addressList,
  amountPerReceiver,
  value,
  jsonRpc
) => {
  const transactionConfig = {
    type: 2,
    chainId: config.nevm.chainId,
    value,
    gasLimit:
      config.nevm.distributor.gasLimit +
      addressList.length * config.nevm.distributor.additionalGasPerAddress,
    maxFeePerGas: ethers.utils.parseUnits(
      config.nevm.distributor.missions.maxFeePerGasInGwei,
      "gwei"
    ),
    maxPriorityFeePerGas: ethers.utils.parseUnits(
      config.nevm.distributor.missions.maxPriorityFeePerGasInGwei,
      "gwei"
    ),
  };
  const distributorContract = getDistributorContract(
    config.nevm.distributor.address,
    jsonRpc
  );

  const distributeTransactionConfig =
    await distributorContract.populateTransaction.distribute(
      amountPerReceiver,
      addressList,
      { value }
    );

  return {
    ...transactionConfig,
    value,
    ...distributeTransactionConfig,
  };
};

module.exports = {
  generateDistributeFundsTransaction,
};
