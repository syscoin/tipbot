const utils = require("../utils");
const c = require("../c.json");
const config = require("../config.json");
const {
  ethers,
  utils: { parseEther },
} = require("ethers");
const db = require("../db");
const com = require("../commandUsage.json");
const { extractCommandAndArguments } = require("./utils/discord");

/**
 * Replies to message authors
 * @param {Discord.Message} discordMessage
 * @param {string} message
 * @returns
 */
const replyToAuthor = (discordMessage, message) => {
  return discordMessage.channel.send({
    embed: {
      color: c.FAIL_COL,
      description: `Hi, **<@${discordMessage.author.id}>** \n${message}`,
    },
  });
};

/**
 * Creates a new mission
 *
 * !create [missionId] [amount] [symbol] [time] <@suggester> <@suggestAmount>
 *
 * @param {Discord.Client} client Discord Client
 * @param {Discord.Message} message Discord message
 * @param {string[]} args Command arguments
 * @param {ethers.providers.JsonRpcProvider} jsonRpc Ethers JSON PRC Provider
 */
async function createMission(client, message, args, jsonRpc) {
  if (utils.checkMissionRole(message)) {
    message.channel.send({
      embed: {
        color: c.FAIL_COL,
        description: "Sorry, you do not have the required permission.",
      },
    });
    return;
  }

  if (!utils.hasAllArgs(args, 4)) {
    message.channel.send({
      embed: {
        color: c.FAIL_COL,
        description: `Missing information. Usage: ${config.prefix}${com.createmission}`,
      },
    });
    return;
  }

  const [missionId, amount, symbol, time] = args;

  if (missionId.includes("@")) {
    return replyToAuthor(`Mission name cannot include a user.`);
  }

  const amountInEth = parseEther(amount);

  if (amountInEth.isZero() || amountInEth.isNegative()) {
    return replyToAuthor(`${amount} is invalid.`);
  }

  if (symbol !== "SYS") {
    const tokenSymbol = symbol;
    const token = config.nevm.supportedTokens.find(
      (token) => token.symbol === tokenSymbol.toUpperCase()
    );
    if (!token) {
      return replyToAuthor(`*${tokenSymbol.toUpperCase()}* is not supported.`);
    }
  }

  const parsedDate = new Date(time);

  if (parsedDate.getTime() < Date.now()) {
    return replyToAuthor("Date should be set in the future.");
  }

  const mission = await db.getMission(missionId);

  console.log({ mission });
}

/**
 * Command Router
 * @param {Discord.Client} client Discord Client
 * @param {Discord.Message} message Discord message
 * @param {ethers.providers.JsonRpcProvider} jsonRpc Ethers JSON PRC Provider
 */
async function router(client, message, jsonRpc) {
  const { command, args } = extractCommandAndArguments(message);

  switch (command) {
    case "create": {
      const ret = await createMission(client, message, args, jsonRpc);
      break;
    }

    default:
      break;
  }
}

module.exports = {
  router,
};
