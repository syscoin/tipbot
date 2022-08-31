const ethers = require("ethers");
const db = require("../db");
const constants = require("../c.json");
const utils = require("../utils");
const Discord = require("discord.js");
const config = require("../config.json");
const { getErc20Contract } = require("./utils/contract");

/**
 * Fetch ERC20 token balance
 * @param {ethers.providers.JsonRpcProvider} provider Ethers JSON PRC Provider
 * @param {string} tokenSymbol Symbol of token being queried
 * @param {string} walletAddress Wallet address of owner
 * @returns {Promise<number> | undefined} Balance of wallet in wei or undefined if not supported
 */
const getTokenBalance = (provider, tokenSymbol, walletAddress) => {
  const token = config.nevm.supportedTokens.find(
    (token) => token.symbol === tokenSymbol.toUpperCase()
  );
  if (!token) {
    return undefined;
  }

  const tokenContract = getErc20Contract(token.address, provider);

  return tokenContract.balanceOf(walletAddress);
};

/**
 * Show SYS balance in NEVM of author
 * @param {Discord.Client} client Discord Client
 * @param {Discord.Message} message Discord message
 * @param {string[]} args Message Arguments
 * @param {ethers.providers.JsonRpcProvider} jsonProvider Ethers JSON PRC Provider
 */
async function balance(client, message, args, jsonProvider) {
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

  let balanceInWei = undefined;

  const tokenSymbol = args.length > 1 ? args[1] : undefined;

  if (tokenSymbol) {
    balanceInWei = await getTokenBalance(
      jsonProvider,
      tokenSymbol,
      nevmWallet.address
    );
    if (balanceInWei === undefined) {
      return message.channel.send({
        embed: {
          color: constants.FAIL_COL,
          description: `Hi, **<@${userId}>** \n*${tokenSymbol.toUpperCase()}* is not supported.`,
        },
      });
    }
  } else {
    balanceInWei = await jsonProvider.getBalance(nevmWallet.address);
  }

  const balanceInEth = ethers.utils.formatEther(balanceInWei);

  user.send({
    embed: {
      color: constants.SUCCESS_COL,
      description: `Hi, **<@${userId}>** Your balance is ${balanceInEth} ${(
        tokenSymbol ?? "SYS"
      ).toUpperCase()}.`,
    },
  });

  if (message.channel.type !== "dm") {
    message.channel
      .send({
        embed: {
          color: constants.SUCCESS_COL,
          description: `:rolling_eyes::point_up: <@${message.author.id}>, I've sent your balance in a private message.`,
        },
      })
      .then((msg) => {
        utils.deleteMsgAfterDelay(msg, 15000);
      });
  }
}

module.exports = balance;
