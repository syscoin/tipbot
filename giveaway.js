
var exports = module.exports = {};

const c = require('./c.json')
const com = require('./commandUsage.json')
const config = require('./config.json')

const db = require('./db.js')
const tips = require('./tips.js')
const utils = require('./utils.js')

const sjs = require('syscoinjs-lib')
const backendURL = 'https://sys-explorer.tk/' // if using localhost you don't need SSL see use 'systemctl edit --full blockbook-syscoin.service' to remove SSL from blockbook
const base64 = require('base-64');
const BigNumber = require('bignumber.js')
BigNumber.config({ DECIMAL_PLACES: 8 })
BigNumber.config({ EXPONENTIAL_AT: 1e+9 })

const EMOJI = '⚡'
const SYS_EMOJI = ':syscoin:'
const REACT_EMOJI = '👍'

var client;
const { ReactionCollector } = require('discord.js')

function formatTime(time) {
    var minutes = "", seconds, verb;
    if (time >= 60) {
        minutes = Math.floor(time/60);
        if (minutes !== 1) {
            minutes = minutes + " minutes, ";
        } else {
            minutes = minutes + " minute, ";
        }
    }

    seconds = time % 60;
    if (seconds !== 1) {
        seconds = seconds + " seconds";
        verb = "are";
    } else {
        seconds = seconds + "second";
        verb = "is";
    }

    return "**" + minutes + seconds + "** " + verb + " left.";
}

function formatWinners(winners) {
    return "**" + winners + "** winner" + ((winners !== 1) ? "s" : "") + ".";
}

//Creates a message to send.
function createMessage(time, winners, amount, symbol) {
    return `
${EMOJI} ${SYS_EMOJI} **${symbol} GIVEAWAY!** ${SYS_EMOJI} ${EMOJI}


${formatTime(time)}
${formatWinners(winners)}
**${amount.toString()}** ${symbol} each.
    `;
}

var reactWith = "\r\n\r\nReact with " + REACT_EMOJI + " to enter!";

//Updates a message.
async function updateMessage(message, time, winners, amount, symbol) {
  try {
    await message.edit("", {
        embed: {
            description:
                createMessage(time, winners, amount, symbol) +
                reactWith
        }
    });
  } catch (error) {
    console.log(error)
  }
}

//End a giveaway.
async function endMessage(message, whoWon) {
  try {
    if (whoWon == false) {
        await message.edit("", {
            embed: {
                description: "This giveaway has ended! Sadly, no one entered."
            }
        });

        return;
    }

    await message.edit("", {
        embed: {
            description:
                "This giveaway has ended! The winners are:\r\n<@" +
                whoWon.join(">\r\n<@") + ">"
        }
    });
  } catch (error) {
    console.log(error)
  }
}

exports.createGiveaway = async function(msg, args, discordClient) {
  try {
    if (!utils.hasAllArgs(args, 4)) {
      console.log(utils.hasAllArgs(args, 4))
      msg.channel.send({embed: { color: c.FAIL_COL, description: `Missing information. Usage: ${config.prefix}` + com.giveaway}})
      return
    }

    client = discordClient
    //Check the argument count.
    if (args.length !== 4) {
        msg.reply("You used the wrong quantity of arguments.");
        return;
    }

    //Extract the arguments.
    var time = args[0];
    time = {
        time: parseInt(time.substr(0, time.length - 1)),
        unit: time.substr(time.length - 1, time.length)
    };
    var winners = args[1];
    winners = {
        quantity: parseInt(winners.substr(0, winners.length - 1)),
        flag: winners.substr(winners.length - 1, winners.length)
    };
    var amount = new BigNumber(args[2]);
    var gCurrency,
        currencyStr,
        token
    var decimals = 8

    if (args[3]) {
      gCurrency = args[3].toUpperCase()
      if (gCurrency !== "SYS") {
        token = await utils.getSPT(gCurrency)

        if (!token) {
          msg.reply(`Couldn't find the token: ${gCurrency}. Please ensure you entered the symbol/GUID correctly.`)
          return
        }

        gCurrency = token.assetGuid
        decimals = token.decimals
        currencyStr = await utils.getExpLink(token.assetGuid, c.TOKEN)
      } else {
        gCurrency = "SYS"
        currencyStr = "SYS"
      }
    }

    //Verify the validity of the time argument.
    if (args[0].length === 1) {
        msg.reply("Your time is missing a proper suffix of either \"s\" or \"m\".");
        return;
    }
    if (Number.isNaN(time.time) ||
        time.time <= 0) {
      msg.reply("Your time is not a positive number.");
      return;
    }
    if (time.unit !== "s" &&
        time.unit !== "m") {
      msg.reply("Your time isn't in seconds or minutes! Please use one or the other.");
      return;
    }
    //Calculate the actual time of the giveaway.
    time = ((time.unit === "m") ? 60 : 1) * time.time;

    //Verify the validity of the winners argument.
    if (args[1].length === 1) {
        msg.reply("Your winners argument is missing the proper suffix of \"w\".");
        return;
    }
    if (
        (Number.isNaN(winners.quantity)) ||
        (winners.quantity <= 0)
    ) {
        msg.reply("Your winners quantity is not a positive number.");
        return;
    }
    if (winners.flag !== "w") {
        msg.reply("Please put a w after the second argument, to mark that it's how many winners the giveaway has.");
        return;
    }
    //Remove the flag now that we're done with it.
    winners = winners.quantity;

    //Verify the validity of the amount argument.
    if (
        (amount.isNaN()) ||
        (amount.lte(0))
    ) {
        msg.reply("Your amount that each winner will win is not a valid positive number.");
        return;
    }
    // make sure the tip amount can't have a higher precision than is supported
    let payWhole = amount.decimalPlaces(decimals, 1)

    if (utils.decimalCount(amount.toString()) > decimals) {
      if (decimals > 0) {
        msg.channel.send({embed: { color: c.FAIL_COL, description: `You are trying to use too many decimals for the ${currencyStr} amount. It can't have any more than ${decimals} decimals.`}})
      } else {
        msg.channel.send({embed: { color: c.FAIL_COL, description: `${currencyStr} is a non-divisible token. It can't have any decimals.`}})
      }
      return
    }

    var usrBalance = await db.getBalance(msg.author.id, gCurrency)

    if (!usrBalance) {
      msg.reply("You don't have any of the given currency.");
      return;
    }

    let usrBalanceBig = new BigNumber(usrBalance.amount);

    //Calculate the total amount;
    var total = amount.times(new BigNumber(winners));
    var totalSat = utils.toSats(total, decimals)
    var enoughBalance = utils.hasEnoughBalance(usrBalance, totalSat)

    if (!enoughBalance) {
      msg.reply("You don't have enough of the given currency to run the giveaway.");
      return;
    }

    //Send the message.
    var giveaway = await msg.channel.send({
        embed: {
            description:
                createMessage(time, winners, amount, currencyStr) +
                reactWith
        }
    });

    //Create the var of who won.
    var whoWon = [];

    //Track the reactions.
    var filter = (reaction, user) => {
      return reaction.emoji.name === REACT_EMOJI && !user.bot;
    }

    var collector = new ReactionCollector(giveaway, filter, {time: time * 1000});

    giveaway.react(REACT_EMOJI);

    //Function to update the time.
    async function updateTime() {
        //Subtract 10 seconds from the time.
        time -= 10;
        var nextInterval = 10000

        if (time - 10 < 0) {
          nextInterval = time * 1000
        }

        if (time <= 0) {
          collector.stop()
          return;
        }

        await updateMessage(giveaway, time, winners, amount, currencyStr);
        //Set a new timeout.
        setTimeout(updateTime, nextInterval);
    }
    //Run the function in ten seconds.
    setTimeout(updateTime, 10000);

    collector.on("collect", async (reaction, user) => {
      var userProfile = await db.getProfile(user.id)

      if (!userProfile) {
        giveaway.channel.send({embed: {description: `<@${user.id}> you have to register with the tipbot before you can enter the giveaway. Type !register in the chat and then react again.`}})
        reaction.users.remove(user)
      }
    })

    collector.on("end", async (collected) => {
        //Create an array out of who entered.
        if (collected.array().length === 0) {
          whoWon = false;
          await endMessage(giveaway, whoWon);
          return
        }

        var users = collected.array()[0].users.cache.array();

        //Make sure someone entered.
        if (users.length === 1) {
          whoWon = false;
          await endMessage(giveaway, whoWon);
          return;
        }

        // add user ids to array for later.
        var userIDs = [];
        for (var i = 0; i < users.length; i++) {
          //Verify it isn't the bot.
          if (!users[i].bot && users[i].id !== msg.author.id) {
            var userProf = await db.getProfile(users[i].id)
            if (userProf) {
              userIDs.push(users[i].id)
            }
          }
        }

        //If we didn't get a full amount of entries, lower the winners amount so our timeout knows to run.
        if (userIDs.length < winners) {
            winners = userIDs.length;
        }

        //Iterate for the amount of winners we need.
        for (i = 0; i < winners; i++) {
            //Select a random user to be a winner.
            var winner = Math.floor(
                Math.random() * userIDs.length
            );
            //Push the user to whoWon.
            whoWon.push(userIDs[winner]);
            //Remove that user so they don't win again..
            userIDs.splice(winner, 1);
        }

        if (whoWon.length === 0) {
          whoWon = false;
          await endMessage(giveaway, whoWon);
          return
        }

        var usrProfile = await db.getProfile(msg.author.id)

        // send the payouts to all the winners
        for (var i = 0; i < whoWon.length; i++) {
          let toProfile = await db.getProfile(whoWon[i])
          var tipInfo = [1, amount, gCurrency]

          tipSuccess = await tips.tipUser(tipInfo, usrProfile, toProfile, c.GIVEAWAY, client, msg)
        }

        await endMessage(giveaway, whoWon);

        //Send a new message to the channel about the winners.
        giveaway.channel.send({
            embed: {
                description: `
              ${EMOJI} ${SYS_EMOJI} **${currencyStr} GIVEAWAY!** ${SYS_EMOJI} ${EMOJI}

              Congratulations to the winners of **${amount.toString()}** ${currencyStr} each!
              ${"<@" + whoWon.join(">\r\n<@") + ">"}
                `
            }
        });
    });
  } catch (error) {
    console.log(error)
    giveaway.channel.send({embed: {description: "Error creating giveaway."}})
  }
};
