
var exports = module.exports = {};

const c = require('./c.json')
const com = require('./commandUsage.json')
const config = require('./config.json')

const db = require('./db.js')
const tips = require('./tips.js')
const utils = require('./utils.js')

const base64 = require('base-64');
const BigNumber = require('bignumber.js')
BigNumber.config({ DECIMAL_PLACES: 8 })
BigNumber.config({ EXPONENTIAL_AT: 1e+9 })

const Discord = require('discord.js')

const EMOJI = '⚡'
const REACT_EMOJI = '🤘'

var LocalStorage = require('node-localstorage').LocalStorage
localStorage = new LocalStorage('./ls')
var ls = require("./ls")

var client;
const { ReactionCollector } = require('discord.js')

async function formatTime(id) {
  var giveaway = await db.getGiveaway(id)

  return `${utils.getTimeDiffStr(new Date(giveaway.endTime))} remaining`
}

function formatWinners(winners) {
    return "**" + winners + "** winner" + ((winners !== 1) ? "s" : "") + ".";
}

//Creates a message description to send.
async function createDescription(time, winners, amount, symbol, giveawayID) {
    return `
${EMOJI} **${symbol} GIVEAWAY!** ${EMOJI}


${(await formatTime(giveawayID))}
${formatWinners(winners)}
**${amount.toString()}** ${symbol} each.
\r\n\r\nReact with ${REACT_EMOJI} to enter!`;
}

//Updates a message.
async function updateMessage(message, time, winners, amount, symbol, link, giveawayID) {
  try {
    await message.edit("", {
        embed: {
            description:
              await createDescription(time, winners, amount, symbol, giveawayID),
            image: { url: link },
            color: c.SUCCESS_COL
        }
    });
  } catch (error) {
    console.log(error)
  }
}

//End a giveaway.
async function endMessage(message, whoWon, link) {
  try {
    if (whoWon == false) {
        await message.edit("", {
            embed: {
                description: "This giveaway has ended! Sadly, no one entered.",
                color: c.FAIL_COL
            }
        });

        return;
    }

    await message.edit("", {
        embed: {
            description:
                "This giveaway has ended! The winners are:\r\n<@" +
                whoWon.join(">\r\n<@") + ">",
            image: { url: link },
            color: c.SUCCESS_COL
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
        if (!currencyStr) {
          msg.channel.send("Error getting token link")
          return
        }
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

    var time = {
        amount: new BigNumber(parseInt(args[0].substr(0, args[0].length - 1))),
        unit: args[0].substr(args[0].length - 1, args[0].length).toUpperCase()
    }

    if (time.unit !== "S" &&
        time.unit !== "M") {
      msg.reply("Your time isn't in seconds or minutes! Please use one or the other.");
      return;
    }

    var timeMilliSeconds = utils.convertToMillisecs(time.amount, time.unit)

    if (timeMilliSeconds.gt(utils.convertToMillisecs(new BigNumber(config.maxGiveawayTimeMins), "m"))) {
      msg.channel.send({embed: { color: c.FAIL_COL, description: `The max auction time is ${config.maxAuctionTimeDays} day(s). Try again with a lower auction time.`}})
      return
    }

    if (timeMilliSeconds.isNaN()) {
      msg.channel.send({embed: { color: c.FAIL_COL, description: `The time amount given is not a number.`}})
      return
    }

    if (!timeMilliSeconds.gt(0)) {
      msg.channel.send({embed: { color: c.FAIL_COL, description: `The time amount given isn't more than 0.`}})
      return
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
        msg.reply("The amount that each winner will win is not a valid positive number.");
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

    var giveawayIndex = ls.get("giveawayIndex")
    if (!giveawayIndex) {
      ls.set("giveawayIndex", 0)
      giveawayIndex = 0
    } else {
      giveawayIndex = Number(giveawayIndex) + 1
      ls.set("giveawayIndex", giveawayIndex)
    }
    console.log("Giveaway index: " + ls.get("giveawayIndex"))

    var now = Date.now()
    var endDate = new Date(timeMilliSeconds.plus(now).toNumber())

    var dbGiveaway = await db.createGiveaway(giveawayIndex, utils.toSats(amount, decimals), gCurrency, endDate)

    if (!dbGiveaway) {
      msg.channel.send({embed: {description: `Error creating giveaway in the database.`}})
      return
    }

    var desc = await createDescription(time, winners, amount, currencyStr, dbGiveaway.giveawayID)

    var embed = new Discord.MessageEmbed()
        .setColor(c.SUCCESS_COL)
        .setDescription(desc)

    var dbSPT = await db.getSPT(token.assetGuid)
    if (dbSPT && dbSPT.linkToNFT) {
      embed.setImage(dbSPT.linkToNFT)
    }

    // send message
    var giveaway = await msg.channel.send(embed)

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
        let diff = endDate.getTime() - Date.now()

        var checkTime
        var nextInterval = 10000

        if (diff < 10000) {
          nextInterval = 700
        }

        if (diff <= 0) {
          collector.stop()
          clearTimeout(checkTime)
          return;
        }

        await updateMessage(giveaway, time, winners, amount, currencyStr, dbSPT.linkToNFT, dbGiveaway.giveawayID);
        //Set a new timeout.
        checkTime = setTimeout(updateTime, nextInterval);
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
        var link = collector.message.embeds[0].image.url
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
          await endMessage(giveaway, whoWon, link);
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

        await endMessage(giveaway, whoWon, link);

        //Send a new message to the channel about the winners.
        desc = `
              ${EMOJI} **${currencyStr} GIVEAWAY!** ${EMOJI}

              Congratulations to the winner(s) of **${amount.toString()}** ${currencyStr}!\n
              ${"<@" + whoWon.join(">\r\n<@") + ">"}
                `

        var embed = await utils.createNFTEmbed(token.assetGuid, c.SUCCESS_COL, desc, false)
        giveaway.channel.send(embed)
        var ended = await db.endGiveaway(dbGiveaway.giveawayID)
    });
  } catch (error) {
    console.log(error)
    giveaway.channel.send({embed: {description: "Error creating giveaway."}})
  }
};
