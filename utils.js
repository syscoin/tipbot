var exports = module.exports = {};

var FAIL_EMOJI = "❌"
var SUCCESS_EMOJI = "✅"

const base64 = require('js-base64');
const Discord = require('discord.js');

const BigNumber = require('bignumber.js')
const lux = require('luxon')
const DateTime = lux.DateTime

const c = require('./c.json')
const config = require('./config.json')
const backendURL = config.blockURL
const nevmExplorerURL = config.nevm.explorerURL;

const sjs = require('syscoinjs-lib')
const BN = sjs.utils.BN

const db = require('./db.js')

// change the precision of a bignumber
exports.toWholeUnit = function(number, precision) {
  precision *= -1
  return number.shiftedBy(precision)
}

// change the precision of a bignumber
exports.toSats = function(number, precision) {
  return number.shiftedBy(precision)
}

// counts the number of decimals a number string has
exports.decimalCount = function(numString) {
  return (numString.split('.')[1] || []).length;
}

// converts a bignumber.js number to bn.js (used by syscoinjs-lib)
exports.bigNumberToBN = function(bigNumber) {
  return new BN(bigNumber.toString())
}

// checks if the writer of the message has the Admin role
exports.checkAdminRole = function(message) {
  try {
    if (!message.member.roles.cache.has(config.AdminRoleID)) {
      return false
    } else {
      return true
    }
  } catch (error) {
    console.log(error)
    message.channel.send({embed: { color: c.FAIL_COL, description: "Error checking Mission role."}});
    return false
  }
}

// checks if the writer of the message has the Mission role
exports.checkMissionRole = function(message) {
  try {
    if (!message.member.roles.cache.has(config.MissionRoleID)) {
      return false
    } else {
      return true
    }
  } catch (error) {
    console.log(error)
    message.channel.send({embed: { color: c.FAIL_COL, description: "Error checking Mission role."}});
    return false
  }
}

// checks if a token exists on the backend based on the guid
exports.getSPT = async function getSPT(guid) {
  try {
    var token = await sjs.utils.fetchBackendAsset(backendURL, guid)
    if (token instanceof Error) {
      return null
    } else {
      return token
    }
  } catch (error) {
    console.log(error)
    return null
  }
}

// returns the number of decimals of the given cryptocurrency
exports.getDecimals = async function(tokenStr) {
  try {
    if (tokenStr !== "SYS") {
      var token = await exports.getSPT(tokenStr)

      if (token instanceof Error) {
        return false
      }

      return token.decimals
    } else {
      return 8
    }
  } catch (error) {
    console.log(error)
    return error
  }
}

// returns a string identifying the cryptocurrency (either GUID or SYS)
exports.getCurrencyStr = async function(tokenStr) {
  try {
    if (tokenStr !== "SYS") {
      var token = await exports.getSPT(tokenStr)

      if (token instanceof Error) {
        return false
      }

      return token.assetGuid
    } else {
      return "SYS"
    }
  } catch (error) {
    console.log(error)
    return error
  }
}

// converts from the given time unit to milliseconds
exports.convertToMillisecs = function(time, unit) {
  unit = unit.toUpperCase()
  switch (unit) {
    case "D":
      time = time.times(24)
    case "H":
      time = time.times(60)
    case "M":
      time = time.times(60)
    case "S":
      return time.times(1000)
    break
  }
}

// converts from milliseconds to minutes
exports.fromMilliToMins = function(timeIn) {

  // seconds
  timeIn = timeIn.dividedBy(1000)

  // minutes
  timeIn = timeIn.dividedBy(60)
  timeOb.time = timeIn

  var timeOb = {
    time: timeIn,
    unit: "m"
  }

  return timeOb
}

// returns whether the given balance has enough in it to send the given amount
// expects a db Balance, and a number/string amount
exports.hasEnoughBalance = function(balance, amount) {
  if (!balance) {
    return false
  }

  var amountToSend = new BigNumber(amount)
  var balanceAmount = new BigNumber(balance.amount)
  var availableAmount = balanceAmount.minus(balance.lockedAmount)

  if (availableAmount.lt(amountToSend)) {
    return false
  }
  if (availableAmount.isNaN()) {
    console.log("Available amount is NaN. Probably issue with lockedAmount")
    console.log(balance)
    return false
  }
  return true
}

// returns a hyperlink to the specified blockbook address/token/tx
exports.getExpLink = async function(data, type, title) {
  try {
    var url
    switch (type) {
      case c.ADDRESS:
        url = `[${title}](${backendURL}/address/${data})`
        break

      case c.TOKEN:
        var tok = await sjs.utils.fetchBackendAsset(backendURL, data)

        if (tok instanceof Error) {
          console.log("Error getting token")
          console.log(data)
          return false
        }

        var currencyStr = base64.decode(tok.symbol) + " (" + tok.assetGuid + ")"
        currencyStr = currencyStr.toUpperCase()

        url = `[${currencyStr}](${backendURL}/asset/${data})`
        break

      case c.TX:
        url = `[${title}](${backendURL}/tx/${data})`
        break
    }

    return url
  } catch (error) {
    console.log(error)
    return error
  }
}

/**
 * 
 * @param {string} data wallet address or token contract address or transaction hash
 * @param {('address'|'token'|'transaction')} type 
 * @param {string} title 
 * @returns 
 */
exports.getNevmExplorerLink = function (data, type, title) {
  switch (type) {
    case "address":
      return `[${title}](${nevmExplorerURL}/address/${data})`;

    case "token":
      return `[${currencyStr}](${nevmExplorerURL}/token/${data})`;

    case "transaction":
      return `[${title}](${nevmExplorerURL}/tx/${data})`;
  }
};

// unlocks an amount in a user's balance (locking used in auctions/trades
// to ensure users can't move their locked funds to cheat the system)
exports.unlockAmount = async function(currency, userID, amount) {
  var balance = await db.getBalance(userID, currency)
  var currentLocked = new BigNumber(balance.lockedAmount)
  var amountBig = new BigNumber(amount)
  var newLocked = currentLocked.minus(amountBig)
  return db.editBalanceLocked(userID, currency, newLocked)
}

// deletes the message after the given delay in milliseconds
exports.deleteMsgAfterDelay = function(msg, tOut) {
  msg.delete({timeout: tOut})
}

// reacts to a given message with the specified success/failure emoji
exports.isSuccessMsgReact = function(isSuccess, message) {
  if (message && message !== undefined) {
    if (isSuccess) {
      message.react(SUCCESS_EMOJI)
    } else {
      message.react(FAIL_EMOJI)
    }
  }
}

// checks if the correct number of arguments have been provided
exports.hasAllArgs = function(args, numOfArgs) {
  return args.length >= numOfArgs
}

// returns the remaining time between now and the end date
exports.getRemainingTime = function(endDate) {
  var now = lux.DateTime.now()
  var end = lux.DateTime.fromISO(endDate.toISOString())

  return end.diff(now, ['days', 'hours', 'minutes', 'seconds'])
}

// returns the elapsed time between the past date and now
exports.getElapsedTime = function(endDate) {
  var now = lux.DateTime.now()
  var end = lux.DateTime.fromISO(endDate.toISOString())

  return now.diff(end, ['days', 'hours', 'minutes', 'seconds'])
}

// returns a string with days/hours/minutes/seconds remaining until the endDate
exports.getTimeDiffStr = function(endDate, past) {
  var diff
  if (past) {
    diff = exports.getElapsedTime(endDate)
  } else {
    diff = exports.getRemainingTime(endDate)
  }

  var timeLeft = ""

  if (diff.values.days > 0) {
    timeLeft += `${diff.values.days} day(s), `
  }

  if (diff.values.hours > 0) {
    timeLeft += `${diff.values.hours} hour(s), `
  }

  if (diff.values.minutes > 0) {
    timeLeft += `${diff.values.minutes} minute(s), `
  }

  if (diff.values.seconds > 0) {
    timeLeft += `${diff.values.seconds.toFixed(0)} second(s)`
  }

  return timeLeft
}

exports.createNFTEmbed = async function(guid, color, desc, isThumbnail) {
  var embed = new Discord.MessageEmbed()
      .setColor(color)
      .setDescription(desc)

  var dbSPT = await db.getSPT(guid)
  if (dbSPT && dbSPT.linkToNFT) {
    if (isThumbnail) {
      embed.setThumbnail(dbSPT.linkToNFT)
    } else {
      embed.setImage(dbSPT.linkToNFT)
    }
  }

  return embed
}
