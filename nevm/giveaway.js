const db = require("../db");
const com = require("../commandUsage.json");
const constants = require("../c.json");
const config = require("../config.json");
const Discord = require("discord.js");
const utils = require("../utils");
const { ethers } = require("ethers");
const BigNumber = require("bignumber.js");
BigNumber.config({ DECIMAL_PLACES: 8 });
BigNumber.config({ EXPONENTIAL_AT: 1e9 });
const {
  generateDistributeFundsTransaction,
} = require("./utils/distributor-contract");
const { runTransaction } = require("./utils/transaction");

const EMOJI = "⚡";
const REACT_EMOJI = "🤘";

const checkRole = (message) => {
  const hasPermissions =
    utils.checkAdminRole(message) || utils.checkMissionRunnerRole(message);
  if (!hasPermissions) {
    message.channel
      .send({
        embed: {
          color: constants.FAIL_COL,
          description: "You don't have permission to create a giveaway.",
        },
      })
      .then((msg) => {
        utils.deleteMessage(msg, 15000);
      });
  }
  return hasPermissions;
};

const checkChannel = (message) => {
  const isEligibleGiveawayChannelId = [
    config.giveawayChannel,
    config.rollCallChannel,
  ].includes(message.channel.id);
  if (!isEligibleGiveawayChannelId) {
    message.channel
      .send({
        embed: {
          color: constants.FAIL_COL,
          description: `Giveaways can only be created in <#${config.giveawayChannel}> or <#${config.rollCallChannel}>.`,
        },
      })
      .then((msg) => {
        utils.deleteMessage(msg, 15000);
      });
  }
  return isEligibleGiveawayChannelId;
};

const checkArgs = (message, args) => {
  const hasAllArgs = utils.hasAllArgs(args, 4);
  if (!hasAllArgs) {
    message.channel.send({
      embed: {
        color: constants.FAIL_COL,
        description:
          `Missing information. Usage: ${config.prefix}` + com.giveaway,
      },
    });
  }
  return hasAllArgs;
};

const checkTimeArg = (message, time) => {
  const isTimeArgCorrect = time.match(/\d+[sm]/);
  if (!isTimeArgCorrect) {
    message.channel.send({
      embed: {
        color: constants.FAIL_COL,
        description:
          `Incorrect format for time. Usage: ${config.prefix}` + com.giveaway,
      },
    });
  }
  return isTimeArgCorrect;
};

const checkAmountArg = (message, amount) => {
  const isAmountArgCorrect = amount.match(/\d+(\.\d+)?/);
  if (!isAmountArgCorrect) {
    message.channel.send({
      embed: {
        color: constants.FAIL_COL,
        description:
          `Incorrect format for amount. Usage: ${config.prefix}` + com.giveaway,
      },
    });
  }
  return isAmountArgCorrect;
};

const checkWinnersArg = (message, winners) => {
  const isWinnersArgCorrect = winners.match(/\d+w/);
  if (!isWinnersArgCorrect) {
    message.channel.send({
      embed: {
        color: constants.FAIL_COL,
        description:
          `Incorrect format for winners. Usage: ${config.prefix}` +
          com.giveaway,
      },
    });
  }
  return isWinnersArgCorrect;
};

const checkCurrencyArg = (message, currency) => {
  const isCurrencyArgCorrect = currency.toUpperCase().match(/NEVM|SYS/);
  if (!isCurrencyArgCorrect) {
    message.channel.send({
      embed: {
        color: constants.FAIL_COL,
        description:
          `Incorrect format for currency. Usage: ${config.prefix}` +
          com.giveaway,
      },
    });
  }
  return isCurrencyArgCorrect;
};

/**
 * Generates success message for giveaway
 * @param {number} winners
 * @param {string} amount
 * @param {string} symbol
 * @param {Date} endTime
 * @returns
 */
const createSuccessMessage = (winners, amount, symbol, endTime) => {
  const timeRemaining = `${utils.getTimeDiffStr(endTime)} remaining`;
  const winnerText =
    "**" + winners + "** winner" + (winners !== 1 ? "s" : "") + ".";
  return `
${EMOJI} **${symbol} GIVEAWAY!** ${EMOJI}


${timeRemaining}
${winnerText}
**${ethers.utils.formatEther(amount).toString()}** ${symbol} each.
\r\n\r\nReact with ${REACT_EMOJI} to enter!`;
};

//End a giveaway.
/**
 *
 * @param {Discord.Message} giveawayMessage
 * @param {string[]} winnerIds
 * @param {string} linkMessage
 * @returns
 */
const createEndMessage = async (giveawayMessage, winnerIds, linkMessage) => {
  try {
    if (winnerIds.length === 0) {
      await giveawayMessage.edit("", {
        embed: {
          description: "This giveaway has ended! Sadly, no one entered.",
          color: constants.FAIL_COL,
        },
      });

      return;
    }

    await giveawayMessage.edit("", {
      embed: {
        description:
          "This giveaway has ended! The winners are:\r\n<@" +
          winnerIds.join(">\r\n<@") +
          ">" +
          (linkMessage ? "\r\n" + linkMessage : ""),
        color: constants.SUCCESS_COL,
      },
    });
  } catch (error) {
    console.log(error);
  }
};

let timer = null;
let giveawayList = [];

const startGiveawayTimer = () => {
  if (timer) {
    clearInterval(timer);
  }
  console.log("Starting giveaway timer");
  timer = setInterval(() => {
    if (giveawayList.length === 0) {
      return;
    }
    const doneGiveaways = [];
    giveawayList.forEach((giveaway) => {
      const {
        giveawayID,
        endTime,
        reactionCollector,
        giveawayMessage,
        expectedWinnersCount,
        reward,
      } = giveaway;

      if (new Date(endTime) < new Date()) {
        console.log(`Giveaway ${giveawayID} has ended!`);
        doneGiveaways.push(giveawayID);
        reactionCollector.stop();
        return;
      }
      giveawayMessage.edit({
        embed: {
          color: constants.SUCCESS_COL,
          description: createSuccessMessage(
            expectedWinnersCount,
            reward,
            "SYS",
            endTime
          ),
        },
      });
    });
    giveawayList = giveawayList.filter(
      (giveaway) => !doneGiveaways.includes(giveaway.giveawayID)
    );
  }, 5000);
};

/**
 *
 * @param {*} authorId
 * @param {Discord.Message} giveawayMessage
 * @param {*} giveawayID
 * @param {*} collectorDurationInMs
 * @param {*} expectedWinnersCount
 * @param {*} jsonProvider
 */
const postCreation = async (
  authorId,
  giveawayMessage,
  giveawayID,
  collectorDurationInMs,
  expectedWinnersCount,
  jsonProvider
) => {
  const giveaway = await db.getGiveaway(giveawayID);
  const { endTime, reward } = giveaway;
  const filter = (reaction, user) => {
    return reaction.emoji.name === REACT_EMOJI && !user.bot;
  };

  const reactionCollector = new Discord.ReactionCollector(
    giveawayMessage,
    filter,
    {
      time: collectorDurationInMs,
    }
  );

  const onReactCollect = async (reaction, user) => {
    const userProfile = await db.getProfile(user.id);
    if (!userProfile) {
      giveawayMessage.channel.send({
        embed: {
          description: `<@${user.id}> you have to register with the tipbot before you can enter the giveaway. Type !register in the chat and then react again.`,
        },
      });
      reaction.users.remove(user);
    }
  };

  const onEnd = async () => {
    const updatedGiveawayMessage = await giveawayMessage.fetch(true);
    const reaction = updatedGiveawayMessage.reactions.cache.get(REACT_EMOJI);

    if (!reaction) {
      console.log("No reaction found for giveaway: " + giveawayID);
      await db.endGiveaway(giveawayID, []);
      createEndMessage(giveawayMessage, []);
      return;
    }

    const userCollection = await reaction.users.fetch();
    const users = userCollection.array();

    if (users.length <= 1) {
      console.log("No users found for giveaway: " + giveawayID);
      await db.endGiveaway(giveawayID, []);
      createEndMessage(giveawayMessage, []);
      return;
    }

    /**
     * @type {Promise<string | boolean>[]}
     */
    const winnerIdPool = users.map((user) => {
      // if (user.bot || user.id === creationMessage.author.id) {
      //   return Promise.resolve(false);
      // }
      return db
        .getProfile(user.id)
        .map((profile) => (profile ? user.id : false));
    });

    const winnerPool = (await Promise.all(winnerIdPool)).filter(
      (id) => typeof id === "string"
    );

    const winnerCount =
      winnerPool.length < expectedWinnersCount
        ? winnerPool.length
        : expectedWinnersCount;

    const finalWinners = [];
    //Iterate for the amount of winners we need.
    for (let i = 0; i < winnerCount; i++) {
      //Select a random user to be a winner.
      const winner = Math.floor(Math.random() * winnerPool.length);
      //Push the user to whoWon.
      finalWinners.push(winnerPool[winner]);
      //Remove that user so they don't win again..
      winnerPool.splice(winner, 1);
    }

    if (finalWinners.length === 0) {
      await db.endGiveaway(giveawayID, []);
      createEndMessage(giveawayMessage, []);
    }

    const nevmWallets = await db.nevm.getNevmWallets(finalWinners);

    const winnerAddresses = nevmWallets.map((wallet) => wallet.address);

    const total = ethers.utils
      .parseUnits(reward.toString(), "wei")
      .mul(finalWinners.length);

    const transactionConfig = await generateDistributeFundsTransaction(
      winnerAddresses,
      reward,
      total.toString(),
      jsonProvider
    );

    const creatorWallet = await db.nevm.getNevmWallet(authorId);
    await db.endGiveaway(giveawayID, finalWinners);
    runTransaction(creatorWallet.privateKey, transactionConfig, jsonProvider)
      .then((response) => {
        console.log(`Giveaway Payout sent for: ${giveawayID}!`);
        const explorerLink = utils.getNevmExplorerLink(
          response.hash,
          "transaction",
          "Click Here to View Transaction"
        );
        createEndMessage(giveawayMessage, finalWinners, explorerLink);
        return response.wait(1);
      })
      .then((receipt) => {
        console.log(`Giveaway Payout confirmed for: ${giveawayID}!`);
        const explorerLink = utils.getNevmExplorerLink(
          receipt.transactionHash,
          "transaction",
          "Transaction Confirmed.\nClick Here to View Transaction"
        );
        createEndMessage(giveawayMessage, finalWinners, explorerLink);
      });
  };

  reactionCollector.on("collect", (...params) => {
    onReactCollect(...params);
  });

  reactionCollector.on("end", () => {
    onEnd();
  });

  giveawayList.push({
    giveawayID,
    endTime,
    reactionCollector,
    giveawayMessage,
    expectedWinnersCount,
    reward,
  });

  giveawayMessage.react(REACT_EMOJI);
};

/**
 * Create giveaway
 * @param {Discord.Message} message
 * @param {string[]} args
 * @param {Discord.Client} client
 * @param {ethers.providers.JsonRpcProvider} jsonProvider
 */
async function createGiveAway(message, args, client, jsonProvider) {
  message.channel.messages;
  if (
    !checkRole(message) ||
    !checkChannel(message) ||
    !checkArgs(message, args)
  ) {
    return;
  }

  const [time, winners, amount, currency] = args;

  // check if time is using the correct format: 10s or 10m
  if (
    !checkTimeArg(message, time) ||
    !checkWinnersArg(message, winners) ||
    !checkCurrencyArg(message, currency) ||
    !checkAmountArg(message, amount)
  ) {
    return;
  }

  const timeUnit = time.slice(-1);
  const timeInMs = utils
    .convertToMillisecs(new BigNumber(parseInt(time)), timeUnit)
    .toNumber();

  const timeExpire = new Date(Date.now() + timeInMs);

  const winnerCount = parseInt(winners);
  const amountInWei = ethers.utils.parseEther(amount);

  // get nevm wallet of the user

  const userId = message.author.id;
  const wallet = await db.nevm.getNevmWallet(userId);

  const balance = await jsonProvider.getBalance(wallet.address);

  //    check if balance is greater or equal winnerCount * amountInWei
  if (balance.lt(amountInWei.mul(winnerCount))) {
    return message.channel.send({
      embed: {
        color: constants.FAIL_COL,
        description: "You don't have enough balance to create this giveaway.",
      },
    });
  }

  // create giveawayId based on count of giveaways in db
  const giveawayId = (await db.getGiveawayCount()) + 1;

  // create giveaway on db
  const giveaway = await db.createGiveaway(
    giveawayId,
    amountInWei,
    "SYS",
    timeExpire,
    message.author.id,
    winnerCount
  );

  // create message for giveaway
  const messageContent = createSuccessMessage(
    winnerCount,
    amountInWei,
    "SYS",
    timeExpire
  );

  const giveawayMessage = await message.channel.send({
    embed: {
      color: constants.SUCCESS_COL,
      description: messageContent,
    },
  });

  await db.recordGiveawayMessage(giveaway.giveawayID, giveawayMessage.id);

  postCreation(
    message.author.id,
    giveawayMessage,
    giveaway.giveawayID,
    timeInMs,
    winnerCount,
    jsonProvider
  );
}
/**
 * Run giveaway thread for a giveaway
 * @param {*} giveaway
 * @param {Discord.TextChannel} giveawayChannel
 * @param {ethers.providers.JsonRpcProvider} jsonProvider
 */
const runGiveaway = async (giveaway, giveawayChannel, jsonProvider) => {
  const {
    giveawayID,
    messageId,
    expectedWinnerCount: winnerCount,
    endTime,
    authorId,
  } = giveaway;
  const giveawayMessage = await giveawayChannel.messages.fetch(messageId);
  const timeDuration = new Date(endTime).getTime() - Date.now();

  console.log(`Resuming giveaway: ${giveawayID}, messageId: ${messageId}`);

  postCreation(
    authorId,
    giveawayMessage,
    giveaway.giveawayID,
    timeDuration,
    winnerCount,
    jsonProvider
  );
};

/**
 *
 * @param {Discord.Client} client
 * @param {ethers.providers.JsonRpcProvider} jsonProvider
 */
async function resumeActiveGiveaways(client, jsonProvider) {
  const channel = await client.channels.fetch(config.giveawayChannel);
  if (channel.isText()) {
    const activeGiveaways = await db.getActiveGiveaways();
    await Promise.all(
      activeGiveaways.map((giveaway) =>
        runGiveaway(giveaway, channel, jsonProvider)
      )
    );
  }
}

module.exports = {
  createGiveAway,
  startGiveawayTimer,
  resumeActiveGiveaways,
};
