var exports = module.exports = {};

const com = require('./commandUsage.json')
const c = require('./c.json')
const config = require('./config.json')
var prefix = config.prefix

const base64 = require('base-64');

const BigNumber = require('bignumber.js')
BigNumber.config({ DECIMAL_PLACES: 8 })
BigNumber.config({ EXPONENTIAL_AT: 1e+9 })

const sjs = require('syscoinjs-lib')
const backendURL = config.blockURL

const db = require('./db.js')
const tips = require('./tips.js')
const utils = require('./utils.js')

var LocalStorage = require('node-localstorage').LocalStorage
localStorage = new LocalStorage('./ls')
var ls = require("./ls")

async function printTrades(trades, message, client) {
  try {
    var userArr = []
    var tokenStrArr = []
    var tokenArr = []

    for (var i = 0; i < trades.length; i++) {
      if (!userArr[trades[i].userA]) {
        userArr[trades[i].userA] = (await client.users.fetch(trades[i].userA)).username
      }

      if (!userArr[trades[i].userB]) {
        userArr[trades[i].userB] = (await client.users.fetch(trades[i].userB)).username
      }

      if (!tokenStrArr[trades[i].tokenA]) {
        if (trades[i].tokenA !== "SYS") {
          tokenStrArr[trades[i].tokenA] = await utils.getExpLink(trades[i].tokenA, c.TOKEN)
        } else {
          tokenStrArr[trades[i].tokenA] = "SYS"
        }
      }

      if (!tokenStrArr[trades[i].tokenB]) {
        if (trades[i].tokenB !== "SYS") {
          tokenStrArr[trades[i].tokenB] = await utils.getExpLink(trades[i].tokenB, c.TOKEN)
        } else {
          tokenStrArr[trades[i].tokenB] = "SYS"
        }
      }

      if (!tokenArr[trades[i].tokenA]) {
        if (trades[i].tokenA !== "SYS") {
          tokenArr[trades[i].tokenA] = await utils.getSPT(trades[i].tokenA)
        } else {
          tokenArr[trades[i].tokenA] = { symbol: "SYS", decimals: 8 }
        }
      }

      if (!tokenArr[trades[i].tokenB]) {
        if (trades[i].tokenB !== "SYS") {
          tokenArr[trades[i].tokenB] = await utils.getSPT(trades[i].tokenB)
        } else {
          tokenArr[trades[i].tokenB] = { symbol: "SYS", decimals: 8 }
        }
      }
    }

    var tradeString = ""

    for (var i = trades.length - 1; i >= 0; i--) {
      var t = trades[i]
      let amountA = utils.toWholeUnit(new BigNumber(t.amountA), tokenArr[t.tokenA].decimals)
      let amountB = utils.toWholeUnit(new BigNumber(t.amountB), tokenArr[t.tokenB].decimals)
      tradeString += `\n\nTrade ${t.tradeID} | Date: ${t.completedTime}`
      tradeString += `\n\t${userArr[t.userA]} <-> ${userArr[t.userB]} | ${amountA} ${tokenStrArr[t.tokenA]} for ${amountB} ${tokenStrArr[t.tokenB]}`
    }

    if (tradeString.length !== 0) {
      message.channel.send({embed: { color: c.SUCCESS_COL, description: tradeString }})
    } else {
      message.channel.send({embed: { color: c.FAIL_COL, description: "No recent trades to show." }})
    }
  } catch (error) {
    console.log(error)
    message.channel.send({embed: { color: c.FAIL_COL, description: "Error printing trades." }})
  }
}

async function cancelTrade(message, id, timedOut) {
  try {
    var trade = await db.getTrade(id)

    if (!trade) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `The specified trade ID is not in the database.`}})
      return
    }

    // unlock the amount that was locked for the trade
    var oldBalance = await db.getBalance(trade.userA, trade.tokenA)
    var oldLocked = new BigNumber(oldBalance.lockedAmount)
    var newLocked = oldLocked.minus(trade.amountA)
    var newBalance = await db.editBalanceLocked(trade.userA, trade.tokenA, newLocked)

    var tradeDeleted = await db.deleteTrade(id)

    if (tradeDeleted) {
      if (timedOut) {
        message.channel.send({embed: { color: c.SUCCESS_COL, description: `Time's up! Trade ${id} cancelled.`}})
      } else {
        message.channel.send({embed: { color: c.SUCCESS_COL, description: `Trade ${id} cancelled.`}})
      }
    } else {
      message.channel.send({embed: { color: c.FAIL_COL, description: `The specified trade ID is not in the database.`}})
    }
  } catch (error) {
    console.log(error)
    message.channel.send({embed: { color: c.FAIL_COL, description: `Error cancelling trade.`}})
  }
}

exports.endTrade = async function(message, id, timedOut) {
  cancelTrade(message, id, timedOut)
}

/*
* command: UserA: !trade [amount] [nft symbol/guid] for [amount] [nft symbol/guid] with @UserB
* args
* 0 - amountA, 1 - tokenA, 3 - amountB, 4 - tokenB
* userA is message.author.id
*/
exports.createTrade = async function(message, args) {
  try {
    var myProfile = await db.getProfile(message.author.id)

    if (!myProfile) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `You must be a registered user on the tipbot to perform this action. Use the !register command to register.`}})
      return
    }

    if (!utils.hasAllArgs(args, 6)) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Missing information. Usage: ${config.prefix}` + com.trade}})
      return
    }

    if (myProfile.restricted) {
       message.channel.send({embed: { color: c.FAIL_COL, description: "<@" + message.author.id + "> Sorry, your account has been restricted.  Please contact a member of the Syscoin Team."}})
       return
    }

    var userB = message.mentions.users.first()
    if (!userB) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Please specify a valid user to trade with."}})
      return
    }

    if (userB.id == message.author.id) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Stop wasting my time! You can't trade with yourself."}})
      return
    }

    var userArgs = [message.author.id, userB.id]
    var tokenArgs = [args[1].toUpperCase(), args[4].toUpperCase()]
    var amountArgs = [args[0], args[3]]
    var profiles = []
    var cryptos = []
    var amountInSats = []
    var balance, token
    for (var i = 0; i < 2; i++) {
      profiles.push(await db.getProfile(userArgs[i]))

      if (!profiles[i]) {
        message.channel.send({embed: { color: c.FAIL_COL, description: "Please ensure both users are registered with the tipbot."}})
        return
      }

      cryptos.push(await utils.getCurrencyStr(tokenArgs[i]))

      if (!cryptos[i]) {
        message.channel.send({embed: { color: c.FAIL_COL, description: `Couldn't find the token: ${tokenArgs[i]}. Please ensure you entered the symbol/GUID correctly.`}})
        return
      }

      var tokenAmount = new BigNumber(amountArgs[i])

      if (tokenAmount.isNaN()) {
        message.channel.send({embed: { color: c.FAIL_COL, description: "One of the amount values is not a number."}})
        return
      }

      if (!tokenAmount.gt(0)) {
        message.channel.send({embed: { color: c.FAIL_COL, description: "One of the amount values isn't more than 0. Try tipping instead!"}})
        return
      }

      var decimals
      if (cryptos[i] === config.ctick) {
        decimals = 8
      } else {
        var token = await utils.getSPT(cryptos[i])
        decimals = token.decimals
      }

      if (utils.decimalCount(tokenAmount.toString()) > decimals) {
        if (decimals > 0) {
          message.channel.send({embed: { color: c.FAIL_COL, description: `You are trying to use too many decimals for the ${tokenArgs[i]} amount. It can't have any more than ${token.decimals} decimals.`}})
        } else {
          message.channel.send({embed: { color: c.FAIL_COL, description: `${tokenArgs[i]} is a non-divisible token. It can't have any decimals.`}})
        }
        return
      }

      amountInSats[i] = utils.toSats(tokenAmount, decimals)

      if (i == 0) {
        balance = await db.getBalance(message.author.id, cryptos[i])
        var enoughBalance = utils.hasEnoughBalance(balance, amountInSats[i])

        if (!enoughBalance) {
          message.channel.send({embed: { color: c.FAIL_COL, description: "You don't have enough balance for this trade. Please deposit more and try again."}})
          return
        }
      }
    }

    // lock balance so user can't send the token somewhere else before the trade is completed
    var currentLocked = new BigNumber(balance.lockedAmount)
    var newLocked = currentLocked.plus(amountInSats[0])
    var updatedBalance = await db.editBalanceLocked(message.author.id, cryptos[0], newLocked)

    var tradeIndex = ls.get("tradeIndex")
    if (!tradeIndex) {
      ls.set("tradeIndex", 0)
    } else {
      tradeIndex = Number(tradeIndex) + 1
      ls.set("tradeIndex", tradeIndex)
    }
    console.log("Trade index: " + ls.get("tradeIndex"))

    var now = Date.now()
    var timeMilliSeconds = utils.convertToMillisecs(new BigNumber(config.tradeTime), "M")
    var endDate = new Date(timeMilliSeconds.plus(now).toNumber())

    var trade = await db.createTrade(tradeIndex, message.author.id, userArgs[1], cryptos[0], cryptos[1], amountInSats[0], amountInSats[1], endDate)
    if (trade) {
      var tokenStr = []
      for (var i = 0; i < 2; i++) {
        if (cryptos[i] !== "SYS") {
          tokenStr.push(await utils.getExpLink(cryptos[i], c.TOKEN))
        } else {
          tokenStr.push("SYS")
        }
      }

      message.channel.send({embed: { color: c.SUCCESS_COL,
        description:  `Trade ID: ${tradeIndex}.` +
                      `\nTrade between: <@${message.author.id}> and <@${userArgs[1]}>` +
                      `\nTrading: ${amountArgs[0]} ${tokenStr[0]} for ${amountArgs[1]} ${tokenStr[1]}` +
                      `\nTrade is open for ${config.tradeTime} minutes. After this time it will be removed.`
      }})
    } else {
      // if trade isn't created for whatever reason then remove locked balance
      var revertedBalance = await db.editBalanceLocked(message.author.id, cryptos[0], currentLocked)
    }
  } catch (error) {
    console.log(error)
    message.channel.send({embed: { color: c.FAIL_COL, description: "Error creating the trade."}})
  }
}

exports.acceptTrade = async function(message, args, client) {
  try {
    var myProfile = await db.getProfile(message.author.id)

    if (!myProfile) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `You must be a registered user on the tipbot to perform this action. Use the !register command to register.`}})
      return
    }

    if (!utils.hasAllArgs(args, 1)) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Missing information. Usage: ${config.prefix}` + com.accept}})
      return
    }

    if (myProfile.restricted) {
       message.channel.send({embed: { color: c.FAIL_COL, description: "<@" + message.author.id + "> Sorry, your account has been restricted.  Please contact a member of the Syscoin Team."}})
       return
    }

    var trade = await db.getTrade(args[0])

    if (trade) {
      if (message.author.id !== trade.userB) {
        message.channel.send({embed: { color: c.FAIL_COL, description: `You are not <@${trade.userB} so you cannot accept this trade.`}})
      }

      var balance = await db.getBalance(message.author.id, trade.tokenB)

      var enoughBalance = utils.hasEnoughBalance(balance, trade.amountB)

      if (!enoughBalance) {
        message.channel.send({embed: { color: c.FAIL_COL, description: "You don't have enough balance. Please deposit more to accept the trade."}})
        return
      }

      var profileA = await db.getProfile(trade.userA)
      var profileB = await db.getProfile(message.author.id)

      if (!profileA || !profileB) {
        message.channel.send({embed: { color: c.FAIL_COL, description: `A profile has gone missing somewhere...`}})
      }

      if (profileA.restricted) {
         message.channel.send({embed: { color: c.FAIL_COL, description: "<@" + profileA.id + ">'s account has been restricted so they cannot take part in this trade."}})
         return
      }

      var amountBigA = new BigNumber(trade.amountA)
      var amountBigB = new BigNumber(trade.amountB)
      var amountAWhole = utils.toWholeUnit(amountBigA, await utils.getDecimals(trade.tokenA))
      var amountBWhole = utils.toWholeUnit(amountBigB, await utils.getDecimals(trade.tokenB))

      var tipInfo1 = [null, amountAWhole, trade.tokenA]
      var tipInfo2 = [null, amountBWhole, trade.tokenB]

      let tipAtoB = await tips.tipUser(tipInfo1, profileA, profileB, c.TRADE, client, message)
      if (tipAtoB) {
        let tipBtoA = await tips.tipUser(tipInfo2, profileB, profileA, c.EXCHANGE, client, message)

        if (!tipBtoA) {
          // if B to A fails, send user A back their cryptos
          let revertAtoB = await tips.tipUser(tipInfo1, profileB, profileA, c.EXCHANGE, client, message)
          message.channel.send({embed: { color: c.FAIL_COL, description: `Trade failed. Reverting...`}})

          if (!revertAtoB) {
            // if the reversion fails restrict profile B so they can't move/withdraw the cryptos.
            // admin will need to correct.
            let restrictedB = await db.editProfile(profileB.userID, profileB.address, true)
            message.channel.send({embed: { color: c.FAIL_COL, description: `Reverting failed. <@${profileB.userID} you have been restricted. Please contact an admin.`}})
          }
        }

        var completedTrade = await db.completeTrade(trade.tradeID)

        if (completedTrade) {
          // unlock the amount that was locked for the trade
          var oldBalance = await db.getBalance(completedTrade.userA, completedTrade.tokenA)
          var oldLocked = new BigNumber(oldBalance.lockedAmount)
          var newLocked = oldLocked.minus(completedTrade.amountA)
          var newBalance = await db.editBalanceLocked(completedTrade.userA, completedTrade.tokenA, newLocked)

          message.channel.send({embed: { color: c.SUCCESS_COL, description: `Trade ${trade.tradeID} successfully completed! Congratulations!`}})
        }
      }
    } else {
      message.channel.send({embed: { color: c.FAIL_COL, description: `The specified trade ID is not in the database.`}})
    }
  } catch (error) {
    console.log(error)
    message.channel.send({embed: { color: c.FAIL_COL, description: `Error accepting trade.`}})
  }
}

exports.cancelTrade = async function(message, args) {
  try {
    var myProfile = await db.getProfile(message.author.id)

    if (!myProfile) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `You must be a registered user on the tipbot to perform this action. Use the !register command to register.`}})
      return
    }

    if (!utils.hasAllArgs(args, 4)) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Missing information. Usage: ${config.prefix}` + com.tradecancel}})
      return
    }

    if (myProfile.restricted) {
       message.channel.send({embed: { color: c.FAIL_COL, description: "<@" + message.author.id + "> Sorry, your account has been restricted.  Please contact a member of the Syscoin Team."}})
       return
    }

    cancelTrade(message, args[0])
  } catch (error) {
    console.log(error)
    message.channel.send({embed: { color: c.FAIL_COL, description: "Error cancelling trade."}})
  }
}

exports.recentTrades = async function(message, args, client) {
  try {
    var token
    if (args[0]) {
      args[0] = args[0].toUpperCase()
      if (args[0] !== "SYS") {
        token = await utils.getSPT(args[0])

        if (!token) {
          message.channel.send({embed: { color: c.FAIL_COL, description: `Couldn't find the token: ${args[0]}. Please ensure you entered the symbol/GUID correctly.`}})
          return
        }

        token = token.assetGuid
      } else {
        token = "SYS"
      }

      var tokenTrades = await db.getRecentTokenTrades(token, config.recentTrades)
      if (!tokenTrades) {
        message.channel.send({embed: { color: c.FAIL_COL, description: "Can't get recent trades. Please try again later." }})
        return
      }

      printTrades(tokenTrades, message, client)
    } else {

      var trades = await db.getRecentTrades(config.recentTrades)
      if (!trades) {
        message.channel.send({embed: { color: c.FAIL_COL, description: "Can't get recent trades. Please try again later." }})
        return
      }

      printTrades(trades, message, client)
    }
  } catch (error) {
    console.log(error)
    message.channel.send({embed: { color: c.FAIL_COL, description: "Error printing recent trades." }})
  }
}

// limit is the time given in mins that a trade will be ending by
exports.getEndingSoon = async function getEndingSoon(limit) {
  try {
    var trades = await db.getLiveTrades()

    if (!trades) {
      console.log("Error - cannot fetch live trades to check end times")
    }

    var tradesEnding = []

    for (var i = 0; i < trades.length; i++) {
      var now = new BigNumber(Date.now())
      var end = new BigNumber(trades[i].endTime.getTime())
      var diff = end.minus(now)

      var secsLeft = diff.dividedBy(1000)

      if (secsLeft.lte(limit)) {
        tradesEnding.push(trades[i])
      }
    }

    return tradesEnding
  } catch (error) {
    console.log(error)
    message.channel.send({embed: { color: c.FAIL_COL, description: `Error finding trades.`}})
  }
}
