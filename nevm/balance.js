const ethers = require("ethers");
const db = require("../db");
const constants = require("../c.json");
const utils = require("../utils");
const Discord = require("discord.js");

/**
 * Show SYS balance in NEVM of author
 * @param {Discord.Client} client Discord Client
 * @param {Discord.Message} message Discord message
 * @param {ethers.providers.JsonRpcProvider} jsonProvider Ethers JSON PRC Provider
 */
async function balance(client, message, jsonProvider) {
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

  const balanceInWei = await jsonProvider.getBalance(nevmWallet.address);
  const balanceInEth = ethers.utils.formatEther(balanceInWei);

  user.send({
    embed: {
      color: constants.SUCCESS_COL,
      description: `Hi, **<@${userId}>** Your balance is ${balanceInEth} SYS.`,
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
