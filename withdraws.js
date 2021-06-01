var exports = module.exports = {};

const com = require('./commandUsage.json')
const c = require('./c.json')
const config = require('./config.json')
var prefix = config.prefix

const BigNumber = require('bignumber.js')
BigNumber.config({ DECIMAL_PLACES: 8 })
BigNumber.config({ EXPONENTIAL_AT: 1e+9 })

const db = require('./db.js')
const utils = require('./utils.js')

const backendURL = config.blockURL
var HDSigner, syscoinjs
const sjs = require('syscoinjs-lib')
const BN = sjs.utils.BN

// signs and sends a tx onchain, edited from the default Syscoin function to return the txID
// for later use
async function signAndSend(res, HDSigner, notaryAssets) {
  try {
    // notarize if necessary
    let psbt = await sjs.utils.signWithHDSigner(res, HDSigner)
    if (notaryAssets) {
      const wasNotarized = await sjs.utils.notarizeRes(res, notaryAssets, psbt.extractTransaction().toHex())
      if (wasNotarized) {
        psbt = await sjs.utils.signWithHDSigner(res, HDSigner)
      } else {
        return psbt
      }
    }
    var result = { psbt: psbt, resSend: null }
    const resSend = await sjs.utils.sendRawTransaction(backendURL, psbt.extractTransaction().toHex(), HDSigner)
    if (resSend.error) {
      console.log('could not send tx! error: ' + resSend.error.message)
    } else if (resSend.result) {
      console.log('tx successfully sent! txid: ' + resSend.result)
      result.txID = resSend.result
      return result
    } else {
      console.log('Unrecognized response from backend: ' + resSend)
    }
    return result
  } catch (error) {
    console.log(error)
  }
}

// used to send a tx onchain
async function sendOnchain(sendTo, amount, currency) {
  try {
    const xpub = HDSigner.getAccountXpub()
    const changeAddress = await HDSigner.getNewChangeAddress()
    var txOpts
    if (currency !== "SYS") {
      txOpts = { rbf: false }
    } else {
      txOpts = { rbf: true }
    }
    const feeRate = new BN(10)

    var txResult
    var sentResult
    if (currency === "SYS") {
      let outputsArr = [
        {address: sendTo, value: amount}
      ]
      try {
        txResult = await syscoinjs.createTransaction(txOpts, changeAddress, outputsArr, feeRate, xpub)
        sentResult = await signAndSend(txResult.res, HDSigner)
        return sentResult
      } catch (error) {
        console.log(error)
        console.log("failed")
        return
      }

    } else {
      const assetMap = new Map([
        [currency, { outputs: [{ address: sendTo, value: amount}], changeAddress: changeAddress }]
      ])
      try {
        txResult = await syscoinjs.assetAllocationSend(txOpts, assetMap, changeAddress, feeRate, xpub)
        sentResult = await signAndSend(txResult.res, HDSigner)
        return sentResult
      } catch (error) {
        console.log(error)
        return
      }
    }
  } catch (error) {
    console.log(error)
    return
  }
}

// withdraws the specified amount of the given cryptocurrency
/**
* command: !withdraw [amount] [symbol/guid]
* args
* 0 - amount, 1 - symbol/guid
*/
exports.withdraw = async function(args, message, client, signer, sysjs) {
  try {
    HDSigner = signer
    syscoinjs = sysjs

    var myProfile = await db.getProfile(message.author.id)

    if (!myProfile) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `You must be a registered user on the tipbot to perform this action. Use the !register command to register.`}})
      return
    }

    if (!utils.hasAllArgs(args, 3)) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Missing information. Usage: ${config.prefix}` + com.withdraw}})
      return
    }

    if (myProfile.restricted) {
       message.channel.send({embed: { color: c.FAIL_COL, description: "<@" + message.author.id + "> Sorry, your account has been restricted.  Please contact a member of the Syscoin Team."}})
       return
    }

    var user = await client.users.fetch(message.author.id)

    var txResult
    if (args[0] == undefined || args[1] == undefined || args[2] == undefined) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Usage: ${prefix}withdraw [address] [amount] [symbol/guid]`}})
      return
    } else {
      var myBalance
      var currencyID = args[2].toUpperCase()
      var value = args[1]
      var sendTo = args[0]
      var spt = await db.getSPT(currencyID)
      if (spt) {
        currencyID = spt.guid
      }
      myBalance = await db.getBalance(message.author.id, currencyID)

      if (!myBalance) {
        message.channel.send({embed: { color: c.FAIL_COL, description: "You don't have a registered balance for this currency."}})
        return
      }

      const backendAccount = await sjs.utils.fetchBackendAccount(backendURL, sendTo)
      if (backendAccount instanceof Error) {
        message.channel.send({embed: { color: c.FAIL_COL, description: "The address you've provided is invalid."}})
        return
      }

      var decimals = 8
      if (currencyID !== "SYS") {
        let token = await sjs.utils.fetchBackendAsset(backendURL, currencyID)
        decimals = token.decimals
      }

      let myBalanceAmount = new BN(myBalance.amount)
      var withdrawAmount, withdrawSat, withdrawWhole
      if (myBalance) {
        if (value == "all") {
          withdrawAmount = new BN(myBalance.amount)
          withdrawWhole = new BigNumber(withdrawAmount).decimalPlaces(decimals, 1)
        } else {
          // make sure the amount can't have a higher precision than is supported
          withdrawWhole = new BigNumber(value).decimalPlaces(decimals, 1)

          if (withdrawWhole.isNaN() || !withdrawWhole.gt(0)) {
            message.channel.send({embed: { color: c.FAIL_COL, description: "The value you are trying to withdraw must be a valid number more than 0."}})
            return
          }

          if (withdrawWhole.lt(config.tipMin)) {
            message.channel.send({embed: { color: c.FAIL_COL, description: `The value you are trying to withdraw is too small, it must be more than ${config.tipMin}.`}})
            return
          }
          withdrawSat = utils.toSats(withdrawWhole, decimals)
          withdrawAmount = utils.bigNumberToBN(withdrawSat)
        }

        var enoughBalance = utils.hasEnoughBalance(myBalance, withdrawSat)

        if (!enoughBalance) {
          message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, you cannot withdraw more than is available in your balance."}})
          return
        }

        // send tx onchain, if tx is successful then edit the user's balances, and log the action
        txResult = await sendOnchain(sendTo, withdrawAmount, currencyID)
        if (txResult.txID) {
          let updatedBalance = myBalanceAmount.sub(withdrawAmount)
          let newBalance = await db.editBalanceAmount(message.author.id, currencyID, updatedBalance)
          let link = await utils.getExpLink(txResult.txID, c.TX, "Click here to see the transaction.")
          user.send({embed: { color: c.SUCCESS_COL, description: `Your withdrawal was successful!\n ${link}`}})

          var sendArr = []
          sendArr.push(sendTo)
          var actionStr = `Withdraw: ${withdrawWhole.toString()} ${currencyID} | txid: ${txResult.txID}`
          try {
            let log = await db.createLog(message.author.id, actionStr, sendArr, withdrawSat.toString())
          } catch (error) {
            console.log("Error creating withdraw log")
            console.log(error)
          }
          console.log(actionStr)
        } else {
          user.send({embed: { color: c.FAIL_COL, description: `Your withdrawal failed. Please contact a member of the Syscoin Team.`}})
        }
      } else {
        message.channel.send({embed: { color: c.FAIL_COL, description: `Can't find your balance. Try registering with ${prefix}register first and depositing some crypto.`}})
        return
      }
    }
  } catch (error) {
    console.log(error)
    message.channel.send({embed: { color: c.FAIL_COL, description: `Error withdrawing.`}})
    return
  }
}
