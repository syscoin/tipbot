var exports = module.exports = {};

var FAIL_EMOJI = "❌"
var SUCCESS_EMOJI = "✅"

const base64 = require('base-64');
const Discord = require('discord.js');

const BigNumber = require('bignumber.js')
const lux = require('luxon')
const DateTime = lux.DateTime

const c = require('./c.json')
const config = require('./config.json')
const backendURL = config.blockURL

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

// checks if the writer of the message has the admin role
exports.checkAdminRole = function(message) {
  try {
    if (!message.member.roles.cache.has(config.adminRoleID)) {
      return false
    } else {
      return true
    }
  } catch (error) {
    console.log(error)
    message.channel.send({embed: { color: c.FAIL_COL, description: "Error checking admin role."}});
    return false
  }
}

// tries to find an SPT in the db and then on the blockchain
exports.getSPT = async function getSPT(tokenStr) {
  try {
    tokenStr = tokenStr.toUpperCase()
    var userSPT = await db.getSPT(tokenStr)
    if (userSPT) {
      return sjs.utils.fetchBackendAsset(backendURL, userSPT.guid)
    } else {
      return sjs.utils.fetchBackendAsset(backendURL, tokenStr)
    }
  } catch (error) {
    console.log(error)
    return error
  }
}

// tries to find an SPT in the db by GUID and then on the blockchain
exports.getSPTByGUID = async function getSPTByGUID(tokenGUID) {
  try {
    var userSPT = await db.getSPTByGUID(tokenGUID)
    if (!userSPT) {
      userSPT = sjs.utils.fetchBackendAsset(backendURL, userSPT.guid)
    }
    return userSPT;
  } catch (error) {
    console.log(error)
    return error
  }
}
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

exports.convertToMillisecs = function(time, unit) {
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

exports.unlockAmount = async function(currency, userID, amount) {
  var balance = await db.getBalance(userID, currency)
  var currentLocked = new BigNumber(balance.lockedAmount)
  var amountBig = new BigNumber(amount)
  var newLocked = currentLocked.minus(amountBig)
  return db.editBalanceLocked(userID, currency, newLocked)
}

exports.deleteMsgAfterDelay = function(msg, tOut) {
  msg.delete({timeout: tOut})
}

exports.isSuccessMsgReact = function(isSent, message) {
  if (message !== undefined) {
    if (isSent) {
      message.react(SUCCESS_EMOJI)
    } else {
      message.react(FAIL_EMOJI)
    }
  }
}

exports.hasAllArgs = function(args, numOfArgs) {
  return args.length >= numOfArgs
}

exports.getRemainingTime = function(endDate) {
  var now = lux.DateTime.now()
  var end = lux.DateTime.fromISO(endDate.toISOString())

  return end.diff(now, ['days', 'hours', 'minutes', 'seconds'])
}

exports.getRemainingTimeStr = function(endDate) {
  var endsIn = exports.getRemainingTime(endDate)

  var timeLeft = ""

  if (endsIn.values.days > 0) {
    timeLeft += `${endsIn.values.days} day(s), `
  }

  if (endsIn.values.hours > 0) {
    timeLeft += `${endsIn.values.hours} hour(s), `
  }

  if (endsIn.values.minutes > 0) {
    timeLeft += `${endsIn.values.minutes} minute(s), `
  }

  if (endsIn.values.seconds > 0) {
    timeLeft += `${endsIn.values.seconds.toFixed(0)} second(s).`
  }

  return timeLeft
}
