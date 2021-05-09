var exports = module.exports = {};

const BigNumber = require('bignumber.js')
BigNumber.config({ DECIMAL_PLACES: 8 })
BigNumber.config({ EXPONENTIAL_AT: 1e+9 })

const c = require('./c.json')
const config = require('./config.json')
var prefix = config.prefix

const db = require('./db.js')
const utils = require('./utils.js')
const tips = require('./tips.js')

// split array
function arraySplit(list, howMany) {
  var idx = 0
  result = []
  while (idx < list.length) {
    if (idx % howMany === 0) result.push([])
    result[result.length - 1].push(list[idx++])
  }
  return result
}

exports.createMission = async function(args, message, client) {
  try {
    console.log(utils.checkAdminRole(message))
    if (!utils.checkAdminRole(message)) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, you do not have the required permission."}});
      return
    }

    var missionName = args[0]
    var payout = args[1]

    var gCurrency,
      currencyStr,
      token
    var decimals = 8

    if (args[2]) {
      gCurrency = args[2].toUpperCase()
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
        currencyStr = "SYS"
      }
    } else {
      gCurrency = "SYS"
      currencyStr = "SYS"
    }

    if (missionName == undefined) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Sorry, you must specify a mission name (one word) with a payout, i.e. ${prefix}createmission m75 2 SYS`}});
      return;
    }

    missionName = args[0].toUpperCase()

    if (missionName.includes("@")) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Mission name cannot include a user, use this format: ${prefix}add mission10 @user`}});
      return;
    }

    var mission = await db.getMission(missionName)
    if (mission) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "That mission has already been created."}});
      return;
    }

    if (payout == undefined) {
        message.channel.send({ embed: { color: c.FAIL_COL, description: `Sorry, you must specify a mission payout, i.e. ${prefix}createmission m75 10 SYS`}});
      return;
    }

    let payoutBig = new BigNumber(payout)

    if (payoutBig.isNaN() || payoutBig.lte(0)) {
        message.channel.send({ embed: { color: c.FAIL_COL, description: `Your mission payout is not a number or is less than 0, try again i.e. ${prefix}createmission m75 10 SYS`}});
      return;
    }

    let satValue = utils.toSats(payoutBig, decimals)
    var missionNew = await db.createMission(missionName, satValue.toString(), gCurrency)
    if (missionNew) {
      message.channel.send({embed: { color: c.SUCCESS_COL, description: ":fireworks: Created a new mission named: **" + missionName + "**"}})
    } else {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Creation of new mission failed: **" + missionName + "**"}})
    }
  } catch (error) {
    console.log(error)
    message.channel.send({embed: { color: c.FAIL_COL, description: "Error creating new mission."}})
  }
}

exports.listMissions = async function(args, message, client) {
  try {
    if (!utils.checkAdminRole(message)) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, you do not have the required permission."}});
      return
    }

    let activeMissions = await db.getAllActiveMissions()
    var txtList = "|"
    for (i = 0; i < activeMissions.length; i++) {
      txtList += " " + activeMissions[i].missionID + " |"
    }

    message.channel.send({embed: { color: c.SUCCESS_COL, description: "Here are the active mission names: \n" + txtList}})
  } catch (error) {
    console.log(error)
    message.channel.send({embed: { color: c.FAIL_COL, description: "Error listing missions."}})
  }
}

exports.missionArchive = async function(args, message, client) {
  try {
    if (!utils.checkAdminRole(message)) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, you do not have the required permission."}});
      return
    }

    let archivedMissions = await db.getAllArchivedMissions()

    var txtList = ""
    for (i = 0; i < archivedMissions.length; i++) {
      txtList += " " + archivedMissions[i].missionID + " |"
    }

    message.channel.send({embed: { color: c.SUCCESS_COL, description: "Here are the archived mission names: \n" + txtList}})
  } catch (error) {
    console.log(error)
    message.channel.send({embed: { color: c.FAIL_COL, description: "Error archiving mission."}})
  }
}

exports.removeFromMission = async function(args, message, client) {
  try {
    if (!utils.checkAdminRole(message)) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, you do not have the required permission."}});
      return
    }

    var missionName = args[0]
    var user = args[1]

    if (missionName == undefined) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Please use this format to remove a user from mission: ${prefix}remove mission10 @user`}});
      return;
    }

    missionName = missionName.toUpperCase()

    var mission = await db.getMission(missionName)
    if (!mission) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, that mission does not exist or has been archived."}});
      return;
    }
    if (user == undefined) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Please use this format to remove a user from mission: ${prefix}remove mission10 @user`}});
      return;
    }
    var userID = user.replace(/<@!|>/gi,"")
    var profileInMission = await db.checkProfileInMission(userID, missionName)
    if (!profileInMission) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, <@" + userID + "> is not in mission: **" + missionName + "**"}})
      return
    }

    var missionEdited = await db.removeProfileFromMission(userID, missionName)

    if (missionEdited) {
      message.channel.send({embed: { color: c.SUCCESS_COL, description: "Removed user from mission " + missionName + ": **<@" + userID + ">**"}})
    } else {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Error removing <@${userID}> from mission ${missionName}`}})
    }
  } catch (error) {
    console.log(error)
    message.channel.send({embed: { color: c.FAIL_COL, description: "Error removing from mission."}})
  }
}

exports.addToMission = async function(args, message, client) {
  try {
    if (!utils.checkAdminRole(message)) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, you do not have the required permission."}});
      return
    }

    var missionName = args[0]
    var user = args[1]

    if (missionName == undefined) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Please use this format to add a user from mission: ${prefix}add mission10 @user`}});
      return;
    }

    missionName = missionName.toUpperCase()

    var mission = await db.getMission(missionName)
    if (!mission) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, that mission does not exist or has been archived."}});
      return;
    }

    if (user == undefined) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Please use this format to add a user from mission: ${prefix}add mission10 @user`}});
      return;
    }
    var userID = user.replace(/<@!|>/gi,"")
    var profileInMission = await db.checkProfileInMission(userID, missionName)
    if (profileInMission) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, <@" + userID + "> is already in mission: **" + missionName + "**"}})
      return
    }
    var missionEdited = await db.addProfileToMission(userID, missionName)

    if (missionEdited) {
      message.channel.send({embed: { color: c.SUCCESS_COL, description: "Added user to mission " + missionName + ": **<@" + userID + ">**"}})
    } else {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Error adding <@${userID}> to mission ${missionName}`}})
    }
  } catch (error) {
    console.log(error)
    message.channel.send({embed: { color: c.FAIL_COL, description: "Error adding to mission."}})
  }
}

exports.listMissionProfiles = async function(args, message, client) {
  try {
    if (!utils.checkAdminRole(message)) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, you do not have the required permission."}});
      return
    }

    var missionName = args[0].toUpperCase()
    if (missionName == undefined) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Please use this format to show mission users: ${prefix}list m10`}});
      return;
    }
    var mission = await db.getMission(missionName)

    if (!mission) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, that mission does not exist or has been archived."}});
      return;
    }

    var missionProfiles = await db.getMissionProfiles(missionName)
    var txtUsers = ""
    missionProfiles.forEach(profile => {
      txtUsers = txtUsers + "<@" + profile.userID + "> "
    })
    message.channel.send({embed: { color: c.SUCCESS_COL, description: ":fireworks: Total of **" + missionProfiles.length + "** users in mission **" + missionName + "** listed below: "}})

    if (missionProfiles.length > 0) {
      //split into groups of 50 users for discord limit
      var users = txtUsers.split(' ');
      var splitUsers = arraySplit(users, 50)
      splitUsers.forEach(arr => {
        var line = ""
        arr.forEach(user => {
          line = line + user + " "
        })
        message.channel.send({embed: { color: c.SUCCESS_COL, description: line}})
      })
    }
  } catch (error) {
    console.log(error)
    message.channel.send({embed: { color: c.FAIL_COL, description: "Error listing missions."}})
  }
}

exports.payMission = async function(args, message, client) {
  try {
    if (!utils.checkAdminRole(message)) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, you do not have the required permission."}});
      return
    }

    if (missionName == undefined) {
      message.channel.send({ embed: { color: c.FAIL_COL, description: `Please use this format to pay mission: ${prefix}pay m10` } });
      return;
    }

    var missionName = args[0].toUpperCase()
    var mission = await db.getMission(missionName)
    if (!mission || !mission.active) {
      message.channel.send({ embed: { color: c.FAIL_COL, description: "Sorry, that mission does not exist or has been archived." } });
      return;
    }

    var myProfile = await db.getProfile(message.author.id)
    var myBalance = await db.getBalance(message.author.id, mission.currencyID)

    // make sure mission payer has the funds to pay all the users
    if (utils.hasEnoughBalance(myBalance, mission.reward)) {
      message.channel.send({ embed: { color: c.FAIL_COL, description: "Sorry, you don't have enough funds to pay the mission!" } });
      return;
    }

    var missionProfiles = await db.getMissionProfiles(missionName)

    console.log(missionProfiles)

    let targets = []
    let tipSuccess
    var txtUsers = ""
    var tipAsset
    if (mission.currencyID !== "SYS") {
      tipAsset = await db.getSPTByGUID(mission.currencyID);
    } else {
      tipAsset = mission.currencyID
    }
    var dividedReward = new BigNumber(mission.reward / missionProfiles.length)
    let tipPerParticipant = dividedReward.decimalPlaces(tipAsset.decimals, 1)
    //Verify the validity of the payout argument.
    if (
      (tipPerParticipant.isNaN()) ||
      (tipPerParticipant.lte(0))
    ) {
      msg.reply("The amount that each participant will receive is below the threshold for this asset.");
      return;
    }
    let tipPerParticipantWhole = utils.toWholeUnit(tipPerParticipant, tipAsset.decimals)
    
    var totalTip = new BigNumber(0)
    for (var i = 0; i < missionProfiles.length; i++) {
      console.log(missionProfiles[i].userID)
      var tipInfo = [1, tipPerParticipantWhole, tipAsset]
      tipSuccess = await tips.tipUser(tipInfo, myProfile, missionProfiles[i], c.MISSION, client, message)

      if (tipSuccess) {
        targets.push(missionProfiles[i].userID)
        txtUsers += "<@" + missionProfiles[i].userID + "> "
        totalTip = totalTip.plus(tipPerParticipant)
      }
    }

    if (targets.length > 0) {
      if (tipInfo[2] == undefined) {
        tipInfo[2] = "SYS"
      } else {
        tipInfo[2] = tipInfo[2].toUpperCase()
      }
      var actionStr = `Pay ${missionName}: ${tipInfo[1]} ${tipInfo[2].currencyStr} | Total: ${totalTip.toString()}`
      let log = await db.createLog(message.author.id, actionStr, targets, totalTip.toString())
    }


    //split into groups of 50 users for discord limit
    var users = txtUsers.split(' ');
    var splitUsers = arraySplit(users, 50)
    splitUsers.forEach(arr => {
      var line = "\n\n"
      arr.forEach(user => {
        line = line + user + "\n "
      })
      message.channel.send({ embed: { color: c.SUCCESS_COL, description: ":fireworks: :moneybag: Paid **" + tipPerParticipant.toString() + " " + tipAsset.currencyStr + "** to " + targets.length + " users (Total = " + totalTip.toString() + " " + tipAsset.currencyStr + ") in mission **" + missionName + "** listed below:" + line } })
    })

    exports.archiveMission(args, message, client)
  } catch (error) {
    console.log(error)
    message.channel.send({embed: { color: c.FAIL_COL, description: "Error paying mission."}})
  }
}

exports.archiveMission = async function(args, message, client) {
  try {
    if (!utils.checkAdminRole(message)) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, you do not have the required permission."}});
      return
    }

    var missionName = args[0]
    if (missionName == undefined) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Sorry, you must specify a mission name to archive, i.e. ${prefix}archive m75`}});
      return;
    }

    missionName = missionName.toUpperCase()
    var mission = await db.getMission(missionName)
    if (!mission) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, that mission does not exist or has been archived."}});
      return;
    }

    var missionUpdated = await db.archiveMission(missionName)

    if (missionUpdated) {
      message.channel.send({embed: { color: c.SUCCESS_COL, description: ":fireworks: The following mission has been archived: **" + missionName + "**"}})
    } else {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Mission archiving failed."}})
    }
  } catch (error) {
    console.log(error)
    message.channel.send({embed: { color: c.FAIL_COL, description: "Error archiving mission."}})
  }
}
