var exports = module.exports = {};

var SYS_EMOJI = ":syscoin:"
var GEN_EMOJI = ":zap:"

const com = require('./commandUsage.json')
const c = require('./c.json')
const config = require('./config.json')
var prefix = config.prefix

const base64 = require('base-64');

const sjs = require('syscoinjs-lib')
const backendURL = config.blockURL
const BigNumber = require('bignumber.js')
BigNumber.config({ DECIMAL_PLACES: 8 })
BigNumber.config({ EXPONENTIAL_AT: 1e+9 })

const db = require('./db.js')
const utils = require('./utils.js')

// args[1] expects a tip amount in whole number form, not sats
exports.tipUser = async function(args, fromProfile, toProfile, type, client, message) {
  try {
    if (args && !args[1].isNaN()) {
      var token
      var isToken = false
      let tipCurrency = args[2]
      let currencyStr = ""
      let decimals = 8
      let emoji = SYS_EMOJI

      if (fromProfile.userID === toProfile.userID) {
        message.channel.send({embed: { color: c.FAIL_COL, description: `You can't send to yourself.`}})
        return false
      }

      if (utils.decimalCount(args[1].toString()) > config.tipMaxDecimals) {
        message.channel.send({embed: { color: c.FAIL_COL, description: `You can only send tips with a maximum of ${config.tipMaxDecimals} decimal places.`}})
        return false
      }

      if (args[2] == undefined) {
        tipCurrency = "SYS"
        currencyStr = "SYS"
      } else {
        tipCurrency = args[2].toUpperCase()
        if (tipCurrency !== "SYS") {
          token = await utils.getSPT(tipCurrency)

          if (!token) {
            message.channel.send({embed: { color: c.FAIL_COL, description: `Couldn't find the token: ${tipCurrency}. Please ensure you entered the symbol/GUID correctly.`}})
            return
          }

          isToken = true
          decimals = token.decimals
          tipCurrency = token.assetGuid
          var symbol = base64.decode(token.symbol).toUpperCase()
          var tokenStr = `${symbol} (${token.assetGuid})`
          currencyStr = await utils.getExpLink(token.assetGuid, c.TOKEN, tokenStr)

          emoji = GEN_EMOJI
        } else {
          tipCurrency = "SYS"
          currencyStr = "SYS"
        }
      }

      if (utils.decimalCount(args[1].toString()) > decimals) {
        if (decimals > 0) {
          message.channel.send({embed: { color: c.FAIL_COL, description: `You are trying to use too many decimals for the ${currencyStr} amount. It can't have any more than ${decimals} decimals.`}})
        } else {
          message.channel.send({embed: { color: c.FAIL_COL, description: `${currencyStr} is a non-divisible token. It can't have any decimals.`}})
        }
        return
      }

      let fromProfileBalance = await db.getBalance(fromProfile.userID, tipCurrency)
      let toProfileBalance = await db.getBalance(toProfile.userID, tipCurrency)
      if (!fromProfile) {
        message.channel.send({embed: { color: c.FAIL_COL, description: "You must first register with the tipbot and deposit crypto to send funds."}})
        return false
      }

      if (!toProfile) {
        message.channel.send({embed: { color: c.FAIL_COL, description: "The user you are trying to send funds to is not registered with the tipbot."}})
        return false
      }

      if (!fromProfileBalance) {
        message.channel.send({embed: { color: 16776960, description: "You do not have a registered balance for this currency."}})
        return false
      }
      if (!toProfileBalance) {
        toProfileBalance = await db.createBalance(toProfile.userID, tipCurrency, "0")
      }
      let fromBalanceAmount = new BigNumber(fromProfileBalance.amount)
      let toBalanceAmount = new BigNumber(toProfileBalance.amount)

      // make sure the tip amount can't have a higher precision than is supported
      let tipWhole = args[1].decimalPlaces(decimals, 1)

      if (tipWhole.isNaN()) {
        message.channel.send({embed: { color: c.FAIL_COL, description: "You haven't entered a valid number for the amount to send."}})
        return false
      }

      if (tipWhole.lte(0)) {
        message.channel.send({embed: { color: c.FAIL_COL, description: "Amount to send must be more than 0."}})
        return false
      }

      var tipInSats = utils.toSats(tipWhole, decimals)
      var enoughBalance
      if (type !== c.TRADE && type !== c.AUCTION) {
        enoughBalance = utils.hasEnoughBalance(fromProfileBalance, tipInSats)
      } else {
        console.log(fromBalanceAmount.toString())
        console.log(tipWhole.toString())
        console.log(tipInSats.toString())
        enoughBalance = fromBalanceAmount.gte(tipInSats)
      }

      if (!enoughBalance) {
        message.channel.send({embed: { color: c.FAIL_COL, description: `<@${fromProfile.userID}> you don't have enough ${currencyStr}. Please deposit more to continue.`}})
        return
      }

      // calculate the new balances and update them in the db
      let fromBalanceUpdated = fromBalanceAmount.minus(tipInSats)
      let toBalanceUpdated = toBalanceAmount.plus(tipInSats)
      let fromBalance = await db.editBalanceAmount(fromProfile.userID, tipCurrency, fromBalanceUpdated)
      let toBalance = await db.editBalanceAmount(toProfile.userID, tipCurrency, toBalanceUpdated)

      var newAmountTo = utils.toWholeUnit(toBalanceUpdated, decimals)
      var newAmountFrom = utils.toWholeUnit(fromBalanceUpdated, decimals)

      client.users.fetch(toProfile.userID).then((usermsg) => {
        usermsg.send({embed: { color: c.SUCCESS_COL, description: `${emoji} <@${fromProfile.userID}> sent you **${tipWhole}** ${currencyStr}! ${emoji}\n  Your new balance: ${newAmountTo.toString()} ${currencyStr}` }})
      });

      client.users.fetch(fromProfile.userID).then((usermsg) => {
        usermsg.send({embed: { color: c.SUCCESS_COL, description: `${emoji} You sent <@${toProfile.userID}> **${tipWhole}** ${currencyStr}! ${emoji}\n Your new balance: ${newAmountFrom.toString()} ${currencyStr}` }})
      });

      if (type === c.GENERAL) {
        message.channel.send({embed: { color: c.SUCCESS_COL, description: `${emoji} <@${fromProfile.userID}> sent **${tipWhole.toString()}** ${currencyStr} to <@${toProfile.userID}>! ${emoji}`}});
      }
      return true
    }
  } catch (error) {
    console.log(error)
    return false
  }
}
