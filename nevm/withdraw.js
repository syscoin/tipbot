const { ethers, BigNumber, utils: etherUtils } = require("ethers");
const constants = require("../constants");
const db = require("../db");
const utils = require("../utils");
const config = require("../config.json");
const { getErc20Contract } = require("./utils/contract");
const prefix = config.prefix;

const sendUsageExample = (message) => {
  message.channel.send({
    embed: {
      color: constants.FAIL_COL,
      description: `Usage: ${prefix}withdraw [address] [amount] [symbol/guid]`,
    },
  });
};

const sendInvalidAddress = (message) => {
  message.channel.send({
    embed: {
      color: constants.FAIL_COL,
      description: `Withdraw: Invalid Address argument. Ex. 0x.........cad13`,
    },
  });
};

const sendInvalidAmount = (message) => {
  message.channel.send({
    embed: {
      color: constants.FAIL_COL,
      description: `Withdraw: Invalid Amount argument. Ex. 100, 0.01, or all`,
    },
  });
};

/**
 * @typedef {Object} WithdrawTokenProps
 * @property {Discord.Message} message Discord message
 * @property {string} tokenSymbol Symbol of the user
 * @property {string} userId User id of the message sender
 * @property {ethers.providers.JsonRpcProvider} jsonRpc Ethers JSON PRC Provider
 * @property {string} amount amount of withdrawal
 * @property {ethers.Wallet} wallet nevm
 * @property {string} recepientAddress NEVM address of Recepient
 */

/**
 *
 * @param {WithdrawTokenProps} params
 * @returns
 */
const generateWithdrawSignedTransaction = async (params) => {
  const {
    tokenSymbol,
    message,
    jsonRpc,
    userId,
    amount,
    wallet,
    recepientAddress,
  } = params;
  const isWithdrawAll = amount === "all";
  const token = config.nevm.supportedTokens.find(
    (token) => token.symbol === tokenSymbol.toUpperCase()
  );
  if (!token) {
    return message.channel.send({
      embed: {
        color: constants.FAIL_COL,
        description: `Hi, **<@${userId}>** \n*${tokenSymbol.toUpperCase()}* is not supported.`,
      },
    });
  }
  const tokenContract = getErc20Contract(token.address, jsonRpc);
  const balance = await tokenContract.balanceOf(wallet.address);
  if (!isWithdrawAll && etherUtils.parseEther(amount).gt(balance)) {
    message.channel.send({
      embed: {
        color: constants.FAIL_COL,
        description:
          "Sorry, you cannot withdraw more than is available in your balance.",
      },
    });
    return;
  }

  let value = isWithdrawAll ? balance : etherUtils.parseEther(amount);

  const nonce = await jsonRpc.getTransactionCount(wallet.address);

  const transferTransactionConfig =
    await tokenContract.populateTransaction.transfer(recepientAddress, value);

  const transactionConfig = {
    type: 2,
    chainId: config.nevm.chainId,
    value: 0,
    gasLimit: config.nevm.tokenGasLimit,
    nonce,
    maxFeePerGas: etherUtils.parseUnits("10", "gwei"),
    maxPriorityFeePerGas: etherUtils.parseUnits("2", "gwei"),
    ...transferTransactionConfig,
  };

  return wallet.signTransaction(transactionConfig);
};

/**
 * Withdraw SYS from author's nevm wallet.
 * @param {Discord.Client} client Discord Client
 * @param {Discord.Message} message Discord message
 * @param {string[]} args Command arguments
 * @param {ethers.providers.JsonRpcProvider} jsonRpc Ethers JSON PRC Provider
 */
async function withdraw(client, message, args, jsonRpc) {
  if (args.length < 2) {
    return sendUsageExample(message);
  }
  const [address, amount, nevmCommand, tokenSymbol] = args;
  const isWithdrawAll = amount === "all";

  if (!etherUtils.isAddress(address)) {
    return sendInvalidAddress(message);
  }

  if (!isWithdrawAll && !BigNumber.isBigNumber(etherUtils.parseEther(amount))) {
    console.log("Invalid Amount", amount);
    return sendInvalidAmount(message);
  }

  const userId = message.author.id;

  const user = await client.users.fetch(userId);

  if (!user) {
    return message.channel.send({
      embed: {
        color: constants.FAIL_COL,
        description: "Could not find user. Please contact an admin.",
      },
    });
  }
  const profile = await db.getProfile(userId);
  if (!profile) {
    return message.channel
      .send({
        embed: {
          color: constants.FAIL_COL,
          description:
            "You don't have a profile yet. Use `!register` to create one.",
        },
      })
      .then((msg) => {
        utils.deleteMsgAfterDelay(msg, 15000);
      });
  }

  const nevmWallet = await db.nevm.getNevmWallet(userId);
  const wallet = new ethers.Wallet(nevmWallet.privateKey);

  if (!nevmWallet) {
    return message.channel
      .send({
        embed: {
          color: constants.FAIL_COL,
          description:
            "You don't have a nevm wallet yet. Use `!register nevm` to create one.",
        },
      })
      .then((msg) => {
        utils.deleteMsgAfterDelay(msg, 15000);
      });
  }

  let signedTransaction = null;
  if (tokenSymbol && tokenSymbol.toUpperCase() !== "SYS") {
    signedTransaction = await generateWithdrawSignedTransaction({
      tokenSymbol,
      message,
      jsonRpc,
      userId,
      amount,
      wallet,
      recepientAddress: address,
    });
  } else {
    const balance = await jsonRpc.getBalance(nevmWallet.address);

    if (!isWithdrawAll && etherUtils.parseEther(amount).gt(balance)) {
      message.channel.send({
        embed: {
          color: constants.FAIL_COL,
          description:
            "Sorry, you cannot withdraw more than is available in your balance.",
        },
      });
      return;
    }

    const gasLimit = config.nevm.gasLimit;
    const maxFeePerGas = etherUtils.parseUnits("10", "gwei");
    const maxGasFee = maxFeePerGas.mul(gasLimit);
    let value = isWithdrawAll
      ? balance.sub(maxGasFee)
      : etherUtils.parseEther(amount);

    if (!value.gt(0)) {
      message.channel.send({
        embed: {
          color: constants.FAIL_COL,
          description:
            "The value you are trying to withdraw must be a valid number more than 0.",
        },
      });
      return;
    }

    const nonce = await jsonRpc.getTransactionCount(wallet.address);
    const minTip = etherUtils.parseUnits(`${config.tipMin}`, "ether");
    const minimumAmount = minTip.add(maxGasFee);

    if (!isWithdrawAll && value.lt(minTip.add(maxGasFee))) {
      return message.channel.send({
        embed: {
          color: constants.FAIL_COL,
          description: `The value you are trying to withdraw is too small, it must be more than ${etherUtils.formatEther(
            minimumAmount.toString()
          )}.`,
        },
      });
    }
    const transactionConfig = {
      type: 2,
      chainId: config.nevm.chainId,
      to: address,
      value,
      gasLimit,
      nonce,
      maxFeePerGas,
      maxPriorityFeePerGas: etherUtils.parseUnits("2", "gwei"),
    };
  }

  console.log("Sending Transaction...", wallet.address);
  runTransaction(wallet.privateKey, transactionConfig, jsonRpc)
    .then((response) => {
      console.log("Transaction Sent!");
      const explorerLink = utils.getNevmExplorerLink(
        response.hash,
        "transaction",
        "Click Here to View Transaction"
      );
      user.send({
        embed: {
          color: constants.SUCCESS_COL,
          description: `Your withdrawal transaction was sent! Please wait for it to be mined.\n${explorerLink}`,
        },
      });
      return response.wait(1);
    })
    .then((receipt) => {
      console.log("Transaction Confirmed!");
      const explorerLink = utils.getNevmExplorerLink(
        receipt.transactionHash,
        "transaction",
        "Click Here to View Transaction"
      );
      user.send({
        embed: {
          color: constants.SUCCESS_COL,
          description: `Your withdrawal was successful!\n ${explorerLink}`,
        },
      });
    });
}

module.exports = withdraw;
