var exports = module.exports = {};

const BigNumber = require('bignumber.js')
BigNumber.config({ DECIMAL_PLACES: 8 })
BigNumber.config({ EXPONENTIAL_AT: 1e+9 })

const c = require('./c.json')
const com = require('./commandUsage.json')
const config = require('./config.json')
var prefix = config.prefix

const db = require('./db.js')
const utils = require('./utils.js')
const tips = require('./tips.js')

// split array
function arraySplit(list, howMany) {
  var idx = 0;
  result = [];
  while (idx < list.length) {
    if (idx % howMany === 0) result.push([])
      result[result.length - 1].push(list[idx++]);
  }
  return result;
}

exports.createMission = async function(args, message, client) {
  try {
    if (!utils.checkAdminRole(message)) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, you do not have the required permission."}});
      return;
    }

    if (!utils.hasAllArgs(args, 4)) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Missing information. Usage: ${config.prefix}${com.createmission}`}})
      return
    }

    var missionName = args[0];
    var payout = args[1];

    var gCurrency,
      currencyStr,
      token;
    var decimals = 8;

    if (args[2]) {
      gCurrency = args[2].toUpperCase();
      if (gCurrency !== "SYS") {
        token = await utils.getSPT(gCurrency);

        if (!token) {
          msg.reply(`Couldn't find the token: ${gCurrency}. Please ensure you entered the symbol/GUID correctly.`);
          return;
        }

        gCurrency = token.assetGuid;
        decimals = token.decimals;
        currencyStr = await utils.getExpLink(token.assetGuid, c.TOKEN);
      } else {
        currencyStr = "SYS";
      }
    } else {
      decimals = 8;
      gCurrency = "SYS";
      currencyStr = "SYS";
    }

    if (missionName == undefined) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Sorry, you must specify a mission name (one word) with a payout, i.e. ${prefix}createmission m75 2 SYS`}});
      return;
    }

    missionName = args[0].toUpperCase();

    if (missionName.includes("@")) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Mission name cannot include a user, use this format: ${prefix}add mission10 @user`}});
      return;
    }

    var mission = await db.getMission(missionName);
    if (mission) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "That mission has already been created."}});
      return;
    }

    if (payout == undefined) {
      message.channel.send({ embed: { color: c.FAIL_COL, description: `Sorry, you must specify a mission payout, i.e. ${prefix}createmission m75 10 SYS`}});
      return;
    }

    let payoutBig = new BigNumber(payout);

    var time = {
        amount: new BigNumber(parseInt(args[3].substr(0, args[3].length - 1))),
        unit: args[3].substr(args[3].length - 1, args[3].length).toUpperCase()
    }

    var timeMilliSeconds = utils.convertToMillisecs(time.amount, time.unit)

    var amountStr = ["payout", "time amount"]
    var amounts = [payoutBig, timeMilliSeconds]

    for (var i = 0; i < amounts.length; i++) {
      if (amounts[i].isNaN()) {
        message.channel.send({embed: { color: c.FAIL_COL, description: `The ${amountStr[i]} given is not a number.`}})
        return
      }

      if (!amounts[i].gt(0)) {
        message.channel.send({embed: { color: c.FAIL_COL, description: `The ${amountStr[i]} given isn't more than 0.`}})
        return
      }
    }

    if (timeMilliSeconds.gt(utils.convertToMillisecs(config.maxAuctionTimeDays))) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `The max auction time is ${config.maxAuctionTimeDays} day(s). Try again with a lower auction time.`}})
      return
    }

    var decimalCount = utils.decimalCount(payoutBig.toString())

    if (decimalCount > decimals) {
      if (decimals > 0) {
        if (decimals > config.tipMaxDecimals) {
          message.channel.send({ embed: { color: c.FAIL_COL, description: `You are trying to use too many decimals for the payout amount. We don't want it dusty in here so the current max tipbot decimal count is ${config.tipMaxDecimals}.`}});
        } else {
          message.channel.send({embed: { color: c.FAIL_COL, description: `You are trying to use too many decimals payout amount. It can't have any more than ${decimals} decimals.`}})
        }
      } else {
        message.channel.send({embed: { color: c.FAIL_COL, description: `${currencyStr} is a non-divisible token. It can't have any decimals.`}})
      }
      return
    }

    if (decimalCount > config.tipMaxDecimals) {
      message.channel.send({ embed: { color: c.FAIL_COL, description: `You are trying to use too many decimals for the payout amount. We don't want it dusty in here so the current max tipbot decimal count is ${config.tipMaxDecimals}.`}});
      return;
    }

    var now = Date.now()
    var endDate = new Date(timeMilliSeconds.plus(now).toNumber())

    let satValue = utils.toSats(payoutBig, decimals);
    var missionNew = await db.createMission(missionName, message.author.id, satValue.toString(), gCurrency, endDate);
    if (missionNew) {
      message.channel.send({ embed: { color: c.SUCCESS_COL, description: ":fireworks: Created a new mission named: **" + missionName + "**" } });
    } else {
      message.channel.send({ embed: { color: c.FAIL_COL, description: "Creation of new mission failed: **" + missionName + "**" } });
    }
  } catch (error) {
    console.log(error);
    message.channel.send({ embed: { color: c.FAIL_COL, description: "Error creating new mission." } });
  }
}

exports.listMissions = async function(args, message, client) {
  try {
    if (!utils.checkAdminRole(message)) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, you do not have the required permission."}});
      return;
    }

    let activeMissions = await db.getAllActiveMissions();
    var txtList = "";
    for (i = 0; i < activeMissions.length; i++) {
      var remainingTime = utils.getRemainingTimeStr(activeMissions[i].endTime)
      txtList += ` ${activeMissions[i].missionID}: ends in ${remainingTime}\n`;
    }

    message.channel.send({ embed: { color: c.SUCCESS_COL, description: "Here are the active missions: \n" + txtList } });
  } catch (error) {
    console.log(error);
    message.channel.send({ embed: { color: c.FAIL_COL, description: "Error listing missions." } });
  }
}

exports.missionArchive = async function(args, message, client) {
  try {
    if (!utils.checkAdminRole(message)) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, you do not have the required permission."}});
      return;
    }

    let archivedMissions = await db.getAllArchivedMissions();

    var txtList = "";
    for (i = 0; i < archivedMissions.length; i++) {
      txtList += " " + archivedMissions[i].missionID + " |";
    }

    message.channel.send({ embed: { color: c.SUCCESS_COL, description: "Here are the archived mission names: \n" + txtList } });
  } catch (error) {
    console.log(error);
    message.channel.send({ embed: { color: c.FAIL_COL, description: "Error archiving mission." } });
  }
}

exports.removeFromMission = async function(args, message, client) {
  try {
    if (!utils.checkAdminRole(message)) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, you do not have the required permission."}});
      return;
    }

    var missionName = args[0];
    var user = args[1];

    if (missionName == undefined) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Please use this format to remove a user from mission: ${prefix}remove mission10 @user`}});
      return;
    }

    missionName = missionName.toUpperCase();

    var mission = await db.getMission(missionName);
    if (!mission) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, that mission does not exist or has been archived."}});
      return;
    }
    if (user == undefined) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Please use this format to remove a user from mission: ${prefix}remove mission10 @user`}});
      return;
    }
    var userID = user.replace(/<@!|>/gi, "");
    var profileInMission = await db.checkProfileInMission(userID, missionName);
    if (!profileInMission) {
      message.channel.send({ embed: { color: c.FAIL_COL, description: "Sorry, <@" + userID + "> is not in mission: **" + missionName + "**" } });
      return;
    }

    var missionEdited = await db.removeProfileFromMission(userID, missionName);

    if (missionEdited) {
      message.channel.send({ embed: { color: c.SUCCESS_COL, description: "Removed user from mission " + missionName + ": **<@" + userID + ">**" } });
    } else {
      message.channel.send({ embed: { color: c.FAIL_COL, description: `Error removing <@${userID}> from mission ${missionName}` } });
    }
  } catch (error) {
    console.log(error);
    message.channel.send({ embed: { color: c.FAIL_COL, description: "Error removing from mission." } });
  }
}

exports.addToMission = async function(args, message, client) {
  try {
    if (!utils.checkAdminRole(message)) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, you do not have the required permission."}});
      return;
    }

    var missionName = args[0];
    var user = args[1];

    if (missionName == undefined) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Please use this format to add a user from mission: ${prefix}add mission10 @user`}});
      return;
    }

    missionName = missionName.toUpperCase();

    var mission = await db.getMission(missionName);
    if (!mission) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, that mission does not exist or has been archived."}});
      return;
    }

    if (user == undefined) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Please use this format to add a user from mission: ${prefix}add mission10 @user`}});
      return;
    }
    var userID = user.replace(/<@!|>/gi, "");
    var profileInMission = await db.checkProfileInMission(userID, missionName);
    if (profileInMission) {
      message.channel.send({ embed: { color: c.FAIL_COL, description: "Sorry, <@" + userID + "> is already in mission: **" + missionName + "**" } });
      return;
    }
    var missionEdited = await db.addProfileToMission(userID, missionName);

    if (missionEdited) {
      message.channel.send({ embed: { color: c.SUCCESS_COL, description: "Added user to mission " + missionName + ": **<@" + userID + ">**" } });
    } else {
      message.channel.send({ embed: { color: c.FAIL_COL, description: `Error adding <@${userID}> to mission ${missionName}` } });
    }
  } catch (error) {
    console.log(error);
    message.channel.send({ embed: { color: c.FAIL_COL, description: "Error adding to mission." } });
  }
}

exports.listMissionProfiles = async function(args, message, client) {
  try {
    if (!utils.checkAdminRole(message)) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, you do not have the required permission."}});
      return;
    }

    var missionName = args[0].toUpperCase();
    if (missionName == undefined) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Please use this format to show mission users: ${prefix}list m10`}});
      return;
    }
    var mission = await db.getMission(missionName);

    if (!mission) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, that mission does not exist or has been archived."}});
      return;
    }

    var token, decimals, currencyStr;
    if (mission.currencyID !== "SYS") {
      try {
        token = await utils.getSPT(mission.currencyID);
        currencyStr = await utils.getExpLink(mission.currencyID, c.TOKEN);
      } catch (error) {
        console.log(`Error finding currency ${mission.currencyID}`)
        message.channel.send({ embed: { color: c.FAIL_COL, description: "Error finding the currency for the mission payout." } });
        return;
      }

      decimals = token.decimals;
    } else {
      currencyStr = config.ctick;
      decimals = 8;
    }

    var payout = new BigNumber(mission.reward)
    var payoutWhole = utils.toWholeUnit(payout, decimals)

    var missionProfiles = await db.getMissionProfiles(missionName);
    var txtUsers = "";
    missionProfiles.forEach(profile => {
      txtUsers = txtUsers + "<@" + profile.userID + "> ";
    })
    var remainingTime = utils.getRemainingTimeStr(mission.endTime)
    message.channel.send({ embed: { color: c.SUCCESS_COL, title: `${mission.missionID}`, description: `Ending in: ${remainingTime}\nTotal payout: ${payoutWhole} ${currencyStr}\n** ${missionProfiles.length} ** users in mission ** ${missionName} ** listed below: ` } });

    if (missionProfiles.length > 0) {
      //split into groups of 50 users for discord limit
      var users = txtUsers.split(' ');
      var splitUsers = arraySplit(users, 50);
      splitUsers.forEach(arr => {
        var line = "";
        arr.forEach(user => {
          line = line + user + " ";
        });
        message.channel.send({ embed: { color: c.SUCCESS_COL, description: line } });
      })
    }
  } catch (error) {
    console.log(error);
    message.channel.send({ embed: { color: c.FAIL_COL, description: "Error listing missions." } });
  }
}

exports.payMission = async function(args, message, client, automated) {
  try {
    if (!utils.checkAdminRole(message) && !automated) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, you do not have the required permission."}});
      return;
    }

    var missionName = args[0].toUpperCase();
    if (missionName == undefined) {
      message.channel.send({ embed: { color: c.FAIL_COL, description: `Please use this format to pay mission: ${prefix}pay m10` } });
      return;
    }

    var mission = await db.getMission(missionName);
    if (!mission || !mission.active) {
      message.channel.send({ embed: { color: c.FAIL_COL, description: "Sorry, that mission does not exist or has been archived." } });
      return;
    }

    var myProfile = await db.getProfile(mission.creator);
    var myBalance = await db.getBalance(mission.creator, mission.currencyID);
    // make sure mission payer has the funds to pay all the users
    if (!utils.hasEnoughBalance(myBalance, mission.reward)) {
      message.channel.send({ embed: { color: c.FAIL_COL, description: "Sorry, you don't have enough funds to pay the mission!" } });
      return;
    }

    // remove mission creator if they're in there
    var missionReward = new BigNumber(mission.reward)
    var missionProfiles = await db.getMissionProfiles(missionName);
    for (var i = 0; i < missionProfiles.length; i++) {
      if (missionProfiles[i].userID === message.author.id) {
        missionProfiles.splice(i, 1)
        break
      }
    }

    if (!missionProfiles.length > 0) {
      message.channel.send({ embed: { color: c.FAIL_COL, description: "Nobody took part in the mission, there's nobody to pay!" } });
      exports.archiveMission([mission.missionID], message, client, true);
      return;
    }

    var txtUsers = "";
    var token, decimals, currencyStr, tipStr;
    if (mission.currencyID !== "SYS") {
      try {
        token = await utils.getSPT(mission.currencyID);
        tipStr = token.assetGuid
        currencyStr = await utils.getExpLink(mission.currencyID, c.TOKEN);
      } catch (error) {
        console.log(`Error finding currency ${mission.currencyID}`)
        message.channel.send({ embed: { color: c.FAIL_COL, description: "Error finding the currency for the mission payout." } });
        return;
      }

      decimals = token.decimals;
    } else {
      tipStr = config.ctick
      currencyStr = config.ctick;
      decimals = 8;
    }
    var dividedReward = missionReward.dividedBy(missionProfiles.length);

    // make sure reward can't have more decimals than is possible or allowed
    var dividedRewardWhole = utils.toWholeUnit(dividedReward, decimals);
    var decimalCount = utils.decimalCount(dividedRewardWhole.toString())
    if (decimalCount > decimals) {
      dividedRewardWhole.toFixed(decimals)
    }
    if (decimalCount > config.tipMaxDecimals) {
      dividedRewardWhole.toFixed(config.tipMaxDecimals)
    }

    if (dividedRewardWhole.lt(config.tipMin)) {
      message.channel.send({ embed: { color: c.FAIL_COL, description: "The mission payout per participant is below the minimum tip amount on the tipbot." } });
      return;
    }
    var tipPerParticipant = new BigNumber(utils.toSats(dividedRewardWhole, decimals));

    //Verify the validity of the payout argument.
    if (tipPerParticipant.isNaN() ||
      tipPerParticipant.lte(0)
    ) {
      message.channel.send({ embed: { color: c.FAIL_COL, description: "The amount that each participant will receive is below the threshold for this asset." } });
      return;
    }

    let tipSuccess;
    let tipPerParticipantWhole = utils.toWholeUnit(tipPerParticipant, decimals);
    var totalTip = new BigNumber(0);
    let targets = [];
    var tipInfo = [1, tipPerParticipantWhole, tipStr];
    for (var i = 0; i < missionProfiles.length; i++) {
      tipSuccess = await tips.tipUser(tipInfo, myProfile, missionProfiles[i], c.MISSION, client, null);

      if (tipSuccess) {
        targets.push(missionProfiles[i].userID);
        txtUsers += "<@" + missionProfiles[i].userID + "> ";
        totalTip = totalTip.plus(tipPerParticipant);
      }
    }
    var totalTipWhole = utils.toWholeUnit(totalTip, decimals)

    if (targets.length > 0) {
      if (tipInfo[2] == undefined) {
        tipInfo[2] = "SYS";
      } else {
        tipInfo[2] = tipInfo[2].toUpperCase();
      }
      var actionStr = `Paid ${missionName}: ${tipInfo[1]} ${currencyStr} per user | Total paid: ${totalTip.toString()}`;
      let log = await db.createLog(message.author.id, actionStr, targets, totalTip.toString());
    }

    //split into groups of 50 users for discord limit
    var users = txtUsers.split(' ');
    var splitUsers = arraySplit(users, 50);
    splitUsers.forEach(arr => {
      var line = "\n\n";
      arr.forEach(user => {
        line = line + user + "\n ";
      });
      var payoutChannel = client.channels.cache.get(config.missionPayOutsChannel);
      payoutChannel.send({ embed: { color: c.SUCCESS_COL, description: ":fireworks: :moneybag: Paid **" + tipPerParticipantWhole.toString() + " " + currencyStr + "** to " + targets.length + " users (Total = " + totalTipWhole.toString() + " " + currencyStr + ") in mission **" + missionName + "** listed below:" + line } });
    })

    exports.archiveMission(args, message, client);
  } catch (error) {
    console.log(error);
    message.channel.send({ embed: { color: c.FAIL_COL, description: "Error paying mission." } });
  }
}

exports.archiveMission = async function(args, message, client, automated) {
  try {
    if (!utils.checkAdminRole(message) && !automated) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, you do not have the required permission."}});
      return;
    }

    var missionName = args[0];
    if (missionName == undefined) {
      message.channel.send({embed: { color: c.FAIL_COL, description: `Sorry, you must specify a mission name to archive, i.e. ${prefix}archive m75`}});
      return;
    }

    missionName = missionName.toUpperCase();
    var mission = await db.getMission(missionName);
    if (!mission) {
      message.channel.send({embed: { color: c.FAIL_COL, description: "Sorry, that mission does not exist or has been archived."}});
      return;
    }

    var missionUpdated = await db.archiveMission(missionName);

    if (missionUpdated) {
      message.channel.send({ embed: { color: c.SUCCESS_COL, description: ":fireworks: The following mission has been archived: **" + missionName + "**" } });
    } else {
      message.channel.send({ embed: { color: c.FAIL_COL, description: "Mission archiving failed." } });
    }
  } catch (error) {
    console.log(error);
    message.channel.send({ embed: { color: c.FAIL_COL, description: "Error archiving mission." } });
  }
}

// limit is the time given in mins that an auction will be ending by
exports.getEndingSoon = async function getEndingSoon(limit) {
  try {
    var missions = await db.getAllActiveMissions()

    if (!missions || missions === undefined) {
      console.log("Error - cannot fetch active missions to check end times")
    }

    var missionsEnding = []

    for (var i = 0; i < missions.length; i++) {
      var now = new BigNumber(Date.now())
      var end = new BigNumber(missions[i].endTime.getTime())
      var diff = end.minus(now)

      var secsLeft = diff.dividedBy(1000)

      if (secsLeft.lte(limit)) {
        missionsEnding.push(missions[i])
      }
    }

    return missionsEnding
  } catch (error) {
    console.log(error)
  }
}
