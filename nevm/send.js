const db = require("../db");
const constants = require("../constants");
const {
  ethers,
  utils: { parseEther, formatEther, parseUnits },
} = require("ethers");
const config = require("../config.json");
const prefix = config.prefix;
const utils = require("../utils");

const SYS_EMOJI = ":boom:";

const sendUsageExample = (message) => {
  message.channel.send({
    embed: {
      color: constants.FAIL_COL,
      description: `Usage: ${prefix}tip [user] [amount] nevm`,
    },
  });
};

/**
 * Sends SYS to a user's nevm wallet.
 * @param {Discord.Client} client Discord Client
 * @param {Discord.Message} message Discord message
 * @param {string[]} args Command arguments
 * @param {Profile} senderProfile Tipbot Profile
 * @param {Profile} receiverProfile Tipbot Profile
 * @param {ethers.providers.JsonRpcProvider} jsonRpc Ethers JSON PRC Provider
 */
async function send(
  client,
  message,
  args,
  senderProfile,
  receiverProfile,
  jsonRpc
) {
  console.log("Send Args", args);
  if (args.length < 2 || !senderProfile || !receiverProfile) {
    return sendUsageExample(message);
  }

  const senderWallet = await db.nevm.getNevmWallet(senderProfile.userID);
  const receiverWallet = await db.nevm.getNevmWallet(receiverProfile.userID);

  if (!senderWallet) {
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

  if (!receiverWallet) {
    return message.channel
      .send({
        embed: {
          color: constants.FAIL_COL,
          description: `The user you are trying to send to doesn't have a nevm wallet yet. <@${receiverProfile.userID}> Use \`!register nevm\` to create one.`,
        },
      })
      .then((msg) => {
        utils.deleteMsgAfterDelay(msg, 15000);
      });
  }

  const gasLimit = config.nevm.gasLimit;
  const maxFeePerGas = parseUnits("10", "gwei");
  const maxGasFee = maxFeePerGas.mul(gasLimit);

  const value = parseEther(args[1].toString());

  if (!value.gt(0)) {
    message.channel.send({
      embed: {
        color: constants.FAIL_COL,
        description:
          "The value you are trying to send must be a valid number more than 0.",
      },
    });
    return;
  }

  const wallet = new ethers.Wallet(senderWallet.privateKey);
  const nonce = await jsonRpc.getTransactionCount(wallet.address);
  const minTip = parseUnits(`${config.tipMin}`, "ether");
  const minimumAmount = minTip.add(maxGasFee);

  if (value.lt(minimumAmount)) {
    return message.channel.send({
      embed: {
        color: constants.FAIL_COL,
        description: `The value you are trying to tip is too small, it must be more than ${formatEther(
          minimumAmount.toString()
        )}.`,
      },
    });
  }

  const signedTransaction = await wallet.signTransaction({
    type: 2,
    chainId: config.nevm.chainId,
    to: receiverWallet.address,
    value,
    gasLimit,
    nonce,
    maxFeePerGas,
    maxPriorityFeePerGas: parseUnits("2", "gwei"),
  });

  const sendUser = await client.users.fetch(senderProfile.userID);
  const receiveUser = await client.users.fetch(receiverProfile.userID);

  const valueInEther = formatEther(value);

  console.log("Sending Transaction...", wallet.address);
  jsonRpc
    .sendTransaction(signedTransaction)
    .then((response) => {
      console.log("Transaction Sent!");
      const explorerLink = utils.getNevmExplorerLink(
        response.hash,
        "transaction",
        "Click Here to View Transaction"
      );
      sendUser.send({
        embed: {
          color: constants.SUCCESS_COL,
          description: `You sent <@${receiverProfile.userID}> ${valueInEther} SYS. Please wait for it to be mined.\n${explorerLink}`,
        },
      });

      receiveUser.send({
        embed: {
          color: constants.SUCCESS_COL,
          description: `${SYS_EMOJI} <@${senderProfile.userID}> sent you **${valueInEther}** SYS! ${SYS_EMOJI}.\nPlease wait for it to be mined.\n${explorerLink}`,
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
      sendUser.send({
        embed: {
          color: constants.SUCCESS_COL,
          description: `Your tip to <@${receiverProfile.userID}> ${valueInEther} SYS is confirmed.\n${explorerLink}`,
        },
      });

      receiveUser.send({
        embed: {
          color: constants.SUCCESS_COL,
          description: `${SYS_EMOJI} The tip <@${senderProfile.userID}> sent you **${valueInEther}** SYS has been confirmed! ${SYS_EMOJI}.\n${explorerLink}`,
        },
      });
    });
}

module.exports = send;
