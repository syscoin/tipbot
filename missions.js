var exports = (module.exports = {});

const BigNumber = require("bignumber.js");
BigNumber.config({ DECIMAL_PLACES: 8 });
BigNumber.config({ EXPONENTIAL_AT: 1e9 });

const c = require("./c.json");
const com = require("./commandUsage.json");
const config = require("./config.json");
var prefix = config.prefix;

const db = require("./db.js");
const utils = require("./utils.js");
const tips = require("./tips.js");
const ethers = require("ethers");
const {
  getDistributorContract,
  getErc20Contract,
} = require("./nevm/utils/contract");
const { registerWallet } = require("./nevm/register");
const { runTransaction } = require("./nevm/utils/transaction");
const Log = require("./log");

// split array
function arraySplit(list, howMany) {
  var idx = 0;
  result = [];
  while (idx < list.length) {
    if (idx % howMany === 0) result.push([]);
    result[result.length - 1].push(list[idx++]);
  }
  return result;
}

/**
 * command: !create/edit [missionID] [amount] [symbol/guid] [timeAmount][s/m/h/d] <@suggester> <suggestAmount>
 * args
 * 0 - missionID, 1 - amount (whole), 2 - symbol/guid, 3 - timeAmount with s/m/h/d, 5 - suggester payout
 */
exports.createOrEditMission = async function (args, message, client, edit) {
  try {
    if (!utils.checkMissionRole(message)) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: "Sorry, you do not have the required permission.",
        },
      });
      return;
    }

    if (!utils.hasAllArgs(args, 4)) {
      if (!edit) {
        message.channel.send({
          embed: {
            color: c.FAIL_COL,
            description: `Missing information. Usage: ${config.prefix}${com.createmission}`,
          },
        });
      } else {
        message.channel.send({
          embed: {
            color: c.FAIL_COL,
            description: `Missing information. Usage: ${config.prefix}${com.editmission}`,
          },
        });
      }
      return;
    }

    let [missionName, payout, currency, timeArg] = args;

    var gCurrency, currencyStr;
    var decimals = 8;

    // set up currency strings and get decimals for converting
    // between whole and sats later
    if (currency) {
      gCurrency = currency.toUpperCase();

      if (gCurrency !== "SYS") {
        const supportedToken = config.nevm.supportedTokens.find(
          (token) => token.symbol === gCurrency
        );
        if (!supportedToken) {
          message.reply(
            `Couldn't find the token: ${gCurrency}. Please ensure you entered the symbol correctly.`
          );
          return;
        }
        decimals = supportedToken.decimals;
        currencyStr = supportedToken.symbol;
      } else {
        currencyStr = "SYS";
      }
    } else {
      decimals = 8;
      gCurrency = "SYS";
      currencyStr = "SYS";
    }

    if (missionName == undefined) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Sorry, you must specify a mission name (one word) with a payout, i.e. ${prefix}createmission m75 2 SYS`,
        },
      });
      return;
    }

    missionName = missionName.toUpperCase();

    if (missionName.includes("@")) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Mission name cannot include a user, use this format: ${prefix}add mission10 @user`,
        },
      });
      return;
    }

    // if it isn't an edit operation then make sure mission doesn't already exist
    var mission = await db.getMission(missionName);
    if (!edit) {
      if (mission) {
        message.channel.send({
          embed: {
            color: c.FAIL_COL,
            description: "That mission has already been created.",
          },
        });
        return;
      }
    }

    if (payout == undefined) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Sorry, you must specify a mission payout, i.e. ${prefix}createmission m75 10 SYS`,
        },
      });
      return;
    }

    let payoutBig = new BigNumber(payout);

    // time object storing the length and unit of time
    var time = {
      amount: new BigNumber(parseInt(timeArg.substr(0, timeArg.length - 1))),
      unit: timeArg.substr(timeArg.length - 1, timeArg.length).toUpperCase(),
    };

    var timeMilliSeconds = utils.convertToMillisecs(time.amount, time.unit);

    var amountStr = ["payout", "time amount"];
    var amounts = [payoutBig, timeMilliSeconds];

    var suggester = message.mentions.users.first();
    var suggesterID = null;
    var suggesterPayout = null;
    if (suggester) {
      suggesterPayout = new BigNumber(args[5]);
      amountStr.push("suggester payout");
      amounts.push(suggesterPayout);
      suggesterID = suggester.id;
    }

    // check to ensure the amount arguments are valid
    for (var i = 0; i < amounts.length; i++) {
      if (amounts[i].isNaN()) {
        message.channel.send({
          embed: {
            color: c.FAIL_COL,
            description: `The ${amountStr[i]} given is not a number.`,
          },
        });
        return;
      }

      if (!amounts[i].gt(0)) {
        message.channel.send({
          embed: {
            color: c.FAIL_COL,
            description: `The ${amountStr[i]} given isn't more than 0.`,
          },
        });
        return;
      }
    }

    // check to ensure the time isn't longer than it can be
    if (
      timeMilliSeconds.gt(
        utils.convertToMillisecs(new BigNumber(config.maxAuctionTimeDays), "d")
      )
    ) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `The max auction time is ${config.maxAuctionTimeDays} day(s). Try again with a lower auction time.`,
        },
      });
      return;
    }

    // check to ensure the decimals of the amount given are valid, i.e. there can't be
    // more decimals than is possible, or than the max decimals allowed by the tipbot
    var decimalCount = utils.decimalCount(payoutBig.toString());
    if (decimalCount > decimals) {
      if (decimals > 0) {
        if (decimals > config.tipMaxDecimals) {
          message.channel.send({
            embed: {
              color: c.FAIL_COL,
              description: `You are trying to use too many decimals for the payout amount. We don't want it dusty in here so the current max tipbot decimal count is ${config.tipMaxDecimals}.`,
            },
          });
        } else {
          message.channel.send({
            embed: {
              color: c.FAIL_COL,
              description: `You are trying to use too many decimals payout amount. It can't have any more than ${decimals} decimals.`,
            },
          });
        }
      } else {
        message.channel.send({
          embed: {
            color: c.FAIL_COL,
            description: `${currencyStr} is a non-divisible token. It can't have any decimals.`,
          },
        });
      }
      return;
    }

    if (decimalCount > config.tipMaxDecimals) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `You are trying to use too many decimals for the payout amount. We don't want it dusty in here so the current max tipbot decimal count is ${config.tipMaxDecimals}.`,
        },
      });
      return;
    }

    const now = Date.now();
    const endDate = new Date(timeMilliSeconds.plus(now).toNumber());

    let value = ethers.utils.parseEther(payoutBig.toString());
    let suggestValue = null;
    if (suggester) {
      suggestValue = ethers.utils.parseEther(suggesterPayout.toString());
    }
    let missionNew;
    if (!edit) {
      missionNew = await db.createMission(
        missionName,
        message.author.id,
        value,
        gCurrency,
        endDate,
        suggesterID,
        suggestValue
      );
    } else {
      const existingMission = await db.getMission(missionName);
      if (!existingMission.nevm) {
        value = utils.toSats(payoutBig, decimals);
        if (suggester) {
          suggestValue = utils.toSats(suggesterPayout, decimals);
        }
      }
      missionNew = await db.editMission(
        missionName,
        value,
        gCurrency,
        endDate,
        suggesterID,
        suggestValue
      );
    }

    if (missionNew) {
      message.channel.send({
        embed: {
          color: c.SUCCESS_COL,
          description:
            ":fireworks: Created/edited a mission named: **" +
            missionName +
            "**",
        },
      });
    } else {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description:
            "Creation/editing of mission failed: **" + missionName + "**",
        },
      });
    }
  } catch (error) {
    console.log(error);
    message.channel.send({
      embed: {
        color: c.FAIL_COL,
        description: "Error creating/editing mission.",
      },
    });
  }
};

// lists the detais of a mission, or if no mission is given it will return a list of
// active missions
/**
 * command: !list <missionID>
 * args
 * 0 - missionID (optional)
 */
exports.listMissions = async function (args, message, client) {
  try {
    if (!utils.checkMissionRole(message)) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: "Sorry, you do not have the required permission.",
        },
      });
      return;
    }

    let activeMissions = await db.getAllActiveMissions();
    let utxoList = "UTXO:\n";
    let nevmList = "NEVM:\n";
    for (i = 0; i < activeMissions.length; i++) {
      const activeMission = activeMissions[i];
      const remainingTime = utils.getTimeDiffStr(activeMissions[i].endTime);
      const line = ` ***${activeMission.missionID}***: ends in ${remainingTime}\n`;
      if (activeMission.nevm) {
        nevmList += line;
      } else {
        utxoList += line;
      }

      if (utxoList === "UTXO:\n") {
        utxoList += "-- EMPTY --";
      }
    }

    message.channel.send({
      embed: {
        color: c.SUCCESS_COL,
        description: `Here are the active missions: \n ${nevmList} \n ${utxoList}`,
      },
    });
  } catch (error) {
    console.log(error);
    message.channel.send({
      embed: { color: c.FAIL_COL, description: "Error listing missions." },
    });
  }
};

// archives a specific mission
/**
 * command: !archive [missionID]
 * args
 * 0 - missionID
 */
exports.missionArchive = async function (args, message, client) {
  try {
    if (!utils.checkMissionRole(message)) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: "Sorry, you do not have the required permission.",
        },
      });
      return;
    }

    let archivedMissions = await db.getAllArchivedMissions();

    var txtList = "";
    for (i = 0; i < archivedMissions.length; i++) {
      txtList += " " + archivedMissions[i].missionID + " |";
    }

    message.channel.send({
      embed: {
        color: c.SUCCESS_COL,
        description: "Here are the archived mission names: \n" + txtList,
      },
    });
  } catch (error) {
    console.log(error);
    message.channel.send({
      embed: { color: c.FAIL_COL, description: "Error archiving mission." },
    });
  }
};

// removes a specific user profile from a mission
/**
 * command: !remove [missionID] @user
 * args
 * 0 - missionID, 1 - @user
 */
exports.removeFromMission = async function (args, message, client) {
  try {
    if (!utils.checkMissionRole(message)) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: "Sorry, you do not have the required permission.",
        },
      });
      return;
    }

    var missionName = args[0];
    var user = args[1];

    if (missionName == undefined) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Please use this format to remove a user from mission: ${prefix}remove mission10 @user`,
        },
      });
      return;
    }

    missionName = missionName.toUpperCase();

    var mission = await db.getMission(missionName);
    if (!mission) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description:
            "Sorry, that mission does not exist or has been archived.",
        },
      });
      return;
    }

    if (user == undefined) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Please use this format to remove a user from mission: ${prefix}remove mission10 @user`,
        },
      });
      return;
    }

    var userID = user.replace(/<@!|>/gi, "");
    var profileInMission = await db.checkProfileInMission(userID, missionName);
    if (!profileInMission) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description:
            "Sorry, <@" +
            userID +
            "> is not in mission: **" +
            missionName +
            "**",
        },
      });
      return;
    }

    var missionEdited = await db.removeProfileFromMission(userID, missionName);

    if (missionEdited) {
      message.channel.send({
        embed: {
          color: c.SUCCESS_COL,
          description:
            "Removed user from mission " +
            missionName +
            ": **<@" +
            userID +
            ">**",
        },
      });
    } else {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Error removing <@${userID}> from mission ${missionName}`,
        },
      });
    }
  } catch (error) {
    console.log(error);
    message.channel.send({
      embed: { color: c.FAIL_COL, description: "Error removing from mission." },
    });
  }
};

// adds a specific user profile to the mission
/**
 * command: !add [missionID] @user
 * args
 * 0 - missionID, 1 - @user
 */
exports.addToMission = async function (args, message, client) {
  try {
    if (!utils.checkMissionRole(message)) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: "Sorry, you do not have the required permission.",
        },
      });
      return;
    }

    var missionName = args[0];
    var user = args[1];

    if (missionName == undefined) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Please use this format to add a user from mission: ${prefix}add mission10 @user`,
        },
      });
      return;
    }

    missionName = missionName.toUpperCase();

    var mission = await db.getMission(missionName);
    if (!mission) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description:
            "Sorry, that mission does not exist or has been archived.",
        },
      });
      return;
    }

    if (user == undefined) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Please use this format to add a user from mission: ${prefix}add mission10 @user`,
        },
      });
      return;
    }
    var userID = user.replace(/<@!|>/gi, "");
    var profileInMission = await db.checkProfileInMission(userID, missionName);
    if (profileInMission) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description:
            "Sorry, <@" +
            userID +
            "> is already in mission: **" +
            missionName +
            "**",
        },
      });
      return;
    }
    var missionEdited = await db.addProfileToMission(userID, missionName);

    if (missionEdited) {
      message.channel.send({
        embed: {
          color: c.SUCCESS_COL,
          description:
            "Added user to mission " + missionName + ": **<@" + userID + ">**",
        },
      });
    } else {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Error adding <@${userID}> to mission ${missionName}`,
        },
      });
    }
  } catch (error) {
    console.log(error);
    message.channel.send({
      embed: { color: c.FAIL_COL, description: "Error adding to mission." },
    });
  }
};

// prints the details of a given mission
/**
 * command: !list <missionID>
 * args
 * 0 - missionID (optional)
 */
exports.printMissionDetails = async function (args, message, client) {
  try {
    if (!utils.checkMissionRole(message)) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: "Sorry, you do not have the required permission.",
        },
      });
      return;
    }

    var missionName = args[0].toUpperCase();
    if (missionName == undefined) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Please use this format to show mission users: ${prefix}list m10`,
        },
      });
      return;
    }
    var mission = await db.getMission(missionName);

    if (!mission) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description:
            "Sorry, that mission does not exist or has been archived.",
        },
      });
      return;
    }

    // set up currency string and get the decimals for converting between
    // wholeUnit and sats later on
    let token, decimals, currencyStr;
    if (mission.currencyID !== "SYS") {
      if (mission.nevm) {
        token = config.nevm.supportedTokens.find(
          (token) => token.symbol === mission.currencyID
        );
        currencyStr = token.symbol;
      } else {
        try {
          token = await utils.getSPT(mission.currencyID);
          currencyStr = await utils.getExpLink(mission.currencyID, c.TOKEN);
        } catch (error) {
          console.log(`Error finding currency ${mission.currencyID}`);
          message.channel.send({
            embed: {
              color: c.FAIL_COL,
              description: "Error finding the currency for the mission payout.",
            },
          });
          return;
        }
      }
      decimals = token.decimals;
    } else {
      currencyStr = config.ctick;
      decimals = 8;
    }

    const payoutWhole = mission.nevm
      ? ethers.utils.formatEther(mission.reward)
      : utils.toWholeUnit(new BigNumber(mission.reward), decimals);

    var missionProfiles = await db.getMissionProfiles(missionName);
    var txtUsers = "";
    missionProfiles.forEach((profile) => {
      txtUsers = txtUsers + "<@" + profile.userID + "> ";
    });

    // get the time remaining until the mission ends
    var remainingTime = utils.getTimeDiffStr(mission.endTime);

    if (mission.suggesterID) {
      var suggesterPayoutWhole = utils.toWholeUnit(
        new BigNumber(mission.suggesterPayout),
        decimals
      );
      message.channel.send({
        embed: {
          color: c.SUCCESS_COL,
          title: `${mission.missionID}`,
          description: `Ending in: ${remainingTime}\nTotal payout: ${payoutWhole} ${currencyStr}\nSuggester <@${mission.suggesterID}> will receive ${suggesterPayoutWhole} ${currencyStr}\n** ${missionProfiles.length} ** users in mission ** ${missionName} ** listed below: `,
        },
      });
    } else {
      message.channel.send({
        embed: {
          color: c.SUCCESS_COL,
          title: `${mission.missionID}`,
          description: `Ending in: ${remainingTime}\nTotal payout: ${payoutWhole} ${currencyStr}\n** ${missionProfiles.length} ** users in mission ** ${missionName} ** listed below: `,
        },
      });
    }

    if (missionProfiles.length > 0) {
      //split into groups of 50 users for discord limit
      var users = txtUsers.split(" ");
      var splitUsers = arraySplit(users, 50);
      splitUsers.forEach((arr) => {
        var line = "";
        arr.forEach((user) => {
          line = line + user + " ";
        });
        message.channel.send({
          embed: { color: c.SUCCESS_COL, description: line },
        });
      });
    }
  } catch (error) {
    console.log(error);
    message.channel.send({
      embed: { color: c.FAIL_COL, description: "Error listing missions." },
    });
  }
};

const utxoPaymission = async (mission, message, client) => {
  var myProfile = await db.getProfile(mission.creator);
  var myBalance = await db.getBalance(mission.creator, mission.currencyID);
  var missionTotalReward = new BigNumber(mission.reward);
  if (mission.suggesterPayout) {
    missionTotalReward = missionTotalReward.plus(mission.suggesterPayout);
  }
  // make sure mission payer has the funds to pay all the users
  if (!utils.hasEnoughBalance(myBalance, missionTotalReward.toString())) {
    message.channel.send({
      embed: {
        color: c.FAIL_COL,
        description: `Sorry, you don't have enough funds to pay the mission: ${mission.missionID}!`,
      },
    });
    return;
  }

  // remove mission creator if they're in there (naughty)
  var missionReward = new BigNumber(mission.reward);
  var missionProfiles = await db.getMissionProfiles(missionName);
  for (var i = 0; i < missionProfiles.length; i++) {
    if (missionProfiles[i].userID === message.author.id) {
      missionProfiles.splice(i, 1);
      break;
    }
  }

  if (!missionProfiles.length > 0) {
    message.channel.send({
      embed: {
        color: c.FAIL_COL,
        description: "Nobody took part in the mission, there's nobody to pay!",
      },
    });
    exports.archiveMission([mission.missionID], message, client, true);
    return;
  }

  var txtUsers = "";
  var token, decimals, currencyStr, tipStr;
  if (mission.currencyID !== "SYS") {
    try {
      token = await utils.getSPT(mission.currencyID);
      tipStr = token.assetGuid;
      currencyStr = await utils.getExpLink(mission.currencyID, c.TOKEN);
    } catch (error) {
      console.log(`Error finding currency ${mission.currencyID}`);
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: "Error finding the currency for the mission payout.",
        },
      });
      return;
    }

    decimals = token.decimals;
  } else {
    tipStr = config.ctick;
    currencyStr = config.ctick;
    decimals = 8;
  }
  var dividedReward = missionReward.dividedBy(missionProfiles.length);

  // make sure reward can't have more decimals than is possible or allowed
  // on the tipbot
  var dividedRewardWhole = utils.toWholeUnit(dividedReward, decimals);
  var decimalCount = utils.decimalCount(dividedRewardWhole.toString());
  if (decimalCount > decimals) {
    dividedRewardWhole = new BigNumber(dividedRewardWhole.toFixed(decimals, 1));
  }
  if (decimalCount > config.tipMaxDecimals) {
    dividedRewardWhole = new BigNumber(
      dividedRewardWhole.toFixed(config.tipMaxDecimals, 1)
    );
  }

  if (dividedRewardWhole.lt(config.tipMin)) {
    message.channel.send({
      embed: {
        color: c.FAIL_COL,
        description:
          "The mission payout per participant is below the minimum tip amount on the tipbot.",
      },
    });
    return;
  }

  var tipPerParticipant = new BigNumber(
    utils.toSats(dividedRewardWhole, decimals)
  );

  //Verify the validity of the payout argument.
  if (tipPerParticipant.isNaN() || tipPerParticipant.lte(0)) {
    message.channel.send({
      embed: {
        color: c.FAIL_COL,
        description:
          "The amount that each participant will receive is below the threshold for this asset.",
      },
    });
    return;
  }

  let tipSuccess;
  var totalTip = new BigNumber(0);
  let targets = [];
  var tipInfo = [1, dividedRewardWhole, tipStr];
  for (var i = 0; i < missionProfiles.length; i++) {
    tipSuccess = await tips.tipUser(
      tipInfo,
      myProfile,
      missionProfiles[i],
      c.MISSION,
      client,
      null
    );

    // if tip is successful add user to the list of targets for logging,
    // and for printing to the channel
    if (tipSuccess) {
      targets.push(missionProfiles[i].userID);
      txtUsers += "<@" + missionProfiles[i].userID + "> ";
      totalTip = totalTip.plus(tipPerParticipant);
    }
  }
  var totalTipWhole = utils.toWholeUnit(totalTip, decimals);

  // pay the suggester their payout
  var suggesterPayout = null;
  var suggesterPayoutWhole;
  var suggesterStr = "";
  if (mission.suggesterID) {
    var suggesterProfile = await db.getProfile(mission.suggesterID);
    if (suggesterProfile) {
      suggesterPayout = new BigNumber(mission.suggesterPayout);
      suggesterPayoutWhole = utils.toWholeUnit(suggesterPayout, decimals);
      var suggesterTipInfo = [1, suggesterPayoutWhole, tipStr];
      tipSuccess = await tips.tipUser(
        suggesterTipInfo,
        myProfile,
        suggesterProfile,
        c.MISSION,
        client,
        null
      );

      if (tipSuccess) {
        suggesterStr = `Good suggestion! <@${mission.suggesterID}> has been paid ${suggesterPayoutWhole} ${currencyStr} for suggesting the mission!`;
      } else {
        message.channel.send({
          embed: {
            color: c.FAIL_COL,
            description: `Sending failed! You couldn't pay the suggester!`,
          },
        });
      }
    }
  }

  if (targets.length > 0) {
    if (tipInfo[2] == undefined) {
      tipInfo[2] = "SYS";
    } else {
      tipInfo[2] = tipInfo[2].toUpperCase();
    }
    var actionStr = `Paid ${missionName}: ${
      tipInfo[1]
    } ${currencyStr} per user | Total paid: ${totalTip.toString()}`;
    let log = await db.createLog(
      message.author.id,
      actionStr,
      targets,
      totalTip.toString()
    );
  }

  //split into groups of 50 users for discord limit
  var users = txtUsers.split(" ");
  var splitUsers = arraySplit(users, 50);
  splitUsers.forEach((arr) => {
    var line = "\n\n";
    arr.forEach((user) => {
      line = line + user + "\n ";
    });
    var payoutChannel = client.channels.cache.get(config.missionPayOutsChannel);
    payoutChannel.send({
      embed: {
        color: c.SUCCESS_COL,
        description:
          ":fireworks: :moneybag: Paid **" +
          dividedRewardWhole.toString() +
          " " +
          currencyStr +
          "** to " +
          targets.length +
          " users (Total = " +
          totalTipWhole.toString() +
          " " +
          currencyStr +
          ") in mission **" +
          missionName +
          "** listed below:" +
          line,
      },
    });
    if (mission.suggesterID && suggesterStr.length > 0) {
      payoutChannel.send({
        embed: { color: c.SUCCESS_COL, description: suggesterStr },
      });
    }
  });

  exports.archiveMission(args, message, client, true);
};

/**
 *
 * @param {Discord.Message} message
 * @param {string} missionName
 * @returns {Promise<any[]>} profiles
 */
const getMissionProfiles = async (message, missionName) => {
  const missionProfiles = await db.getMissionProfiles(missionName);
  if (process.env.NODE_ENV === "development") {
    return missionProfiles;
  }
  return missionProfiles.filter(
    (profile) => profile.userID !== message.author.id
  );
};

/**
 *
 * @param {Discord.Message} message
 */
const sendInvalidParticipationMessage = (message) => {
  message.channel.send({
    embed: {
      color: c.FAIL_COL,
      description: "Nobody took part in the mission, there's nobody to pay!",
    },
  });
};

/**
 *
 * @param {Discord.Message} message
 */
const sendInvalidTipMessage = (message) => {
  message.channel.send({
    embed: {
      color: c.FAIL_COL,
      description:
        "The mission payout per participant is below the minimum tip amount on the tipbot.",
    },
  });
};

/**
 *
 * @param {Discord.Message} message
 * @param {} mission
 */
const sendNotEnoughBalanceMessage = (message, mission) => {
  message.channel.send({
    embed: {
      color: c.FAIL_COL,
      description: `Sorry, you don't have enough funds to pay the mission: ${mission.missionID}!`,
    },
  });
};

/**
 *
 * @param {string[]} addressList
 * @param {ethers.ethers.BigNumber} amountPerReceiver
 * @param {ethers.ethers.BigNumber} value To be sent to contract
 * @param {ethers.ethers.providers.JsonRpcProvider} jsonProvider
 */
const generateDistributeFundsTransaction = async (
  addressList,
  amountPerReceiver,
  value,
  jsonRpc
) => {
  const transactionConfig = {
    type: 2,
    chainId: config.nevm.chainId,
    value,
    gasLimit:
      config.nevm.distributor.gasLimit +
      addressList.length * config.nevm.distributor.additionalGasPerAddress,
    maxFeePerGas: ethers.utils.parseUnits("5.06", "gwei"),
    maxPriorityFeePerGas: ethers.utils.parseUnits("5", "gwei"),
  };
  const distributorContract = getDistributorContract(
    config.nevm.distributor.address,
    jsonRpc
  );

  const distributeTransactionConfig =
    await distributorContract.populateTransaction.distribute(
      amountPerReceiver,
      addressList,
      { value }
    );

  return {
    ...transactionConfig,
    value,
    ...distributeTransactionConfig,
  };
};

const generateSetTokenAllownce = async (
  creatorAddress,
  tokenAddress,
  amount,
  jsonRpc
) => {
  const transactionConfig = {
    type: 2,
    chainId: config.nevm.chainId,
    gasLimit: config.nevm.tokenApproveGasLimit,
    maxFeePerGas: ethers.utils.parseUnits("2.56", "gwei"),
    maxPriorityFeePerGas: ethers.utils.parseUnits("2.5", "gwei"),
  };
  const tokenContract = await getErc20Contract(tokenAddress, jsonRpc);
  const approveTransactionConfig =
    await tokenContract.populateTransaction.approve(
      config.nevm.distributor.address,
      amount
    );

  return { ...transactionConfig, ...approveTransactionConfig };
};

const generateDistributeTokensTransaction = async (
  creatorAddress,
  addressList,
  amountPerReceiver,
  tokenAddress,
  jsonRpc
) => {
  const transactionConfig = {
    type: 2,
    chainId: config.nevm.chainId,
    gasLimit:
      config.nevm.distributor.gasLimit +
      addressList.length * config.nevm.tokenGasLimit,
    maxFeePerGas: ethers.utils.parseUnits("3.06", "gwei"),
    maxPriorityFeePerGas: ethers.utils.parseUnits("3", "gwei"),
  };
  const distributorContract = getDistributorContract(
    config.nevm.distributor.address,
    jsonRpc
  );

  const distributeTransactionConfig =
    await distributorContract.populateTransaction.distributeTokens(
      amountPerReceiver,
      tokenAddress,
      addressList
    );

  return {
    ...transactionConfig,
    ...distributeTransactionConfig,
  };
};

/**
 *
 * @param {Discord.Client} client
 * @param {string} totalAmount
 * @param {string} currencyStr
 * @param {string[]} userList
 */
const sendPayoutmessage = (
  client,
  totalAmount,
  dividedAmount,
  currencyStr,
  missionName,
  userList,
  extraMessage
) => {
  const payoutChannel = client.channels.cache.get(config.missionPayOutsChannel);
  payoutChannel.send({
    embed: {
      color: c.SUCCESS_COL,
      description:
        ":fireworks: :moneybag: Paid **" +
        dividedAmount +
        " " +
        currencyStr +
        "** to " +
        userList.length +
        " users (Total = " +
        totalAmount.toString() +
        " " +
        currencyStr +
        ") in mission **" +
        missionName +
        "** listed below:\n\n" +
        userList.map((userId) => `<@${userId}>`).join("\n") +
        (extraMessage ?? ""),
    },
  });
};

/**
 *
 * @param {string} symbol
 * @param {string} ownerAddress
 * @param {string} privateKey
 * @param {string[]} addressList
 * @param {string} rewardDividedInWei
 * @param {string} rewardInWei
 * @param {*} jsonRpc
 * @returns
 */
const sendPayoutTransactions = async (
  symbol,
  ownerAddress,
  privateKey,
  addressList,
  rewardDividedInWei,
  rewardInWei,
  jsonRpc
) => {
  const supportedToken = config.nevm.supportedTokens.find(
    (token) => token.symbol === symbol
  );
  if (supportedToken) {
    const approvalTransaction = await generateSetTokenAllownce(
      ownerAddress,
      supportedToken.address,
      rewardInWei,
      jsonRpc
    );
    const approvalReceipt = await runTransaction(
      privateKey,
      approvalTransaction,
      jsonRpc
    ).then((resp) => resp.wait(1));
    Log.debug({ approvalReceipt });

    const distributTokensTransaction =
      await generateDistributeTokensTransaction(
        ownerAddress,
        addressList,
        rewardDividedInWei,
        supportedToken.address,
        jsonRpc
      );
    return runTransaction(privateKey, distributTokensTransaction, jsonRpc);
  }

  // const configs = addressList.map((address) => ({
  //   type: 2,
  //   chainId: config.nevm.chainId,
  //   to: address,
  //   value: rewardDividedInWei,
  //   gasLimit: config.nevm.distributor.gasLimit,
  //   maxFeePerGas: parseUnits("2.56", "gwei"),
  //   maxPriorityFeePerGas: parseUnits("2.5", "gwei"),
  // }));

  const distributeTransactionConfig = await generateDistributeFundsTransaction(
    addressList,
    rewardDividedInWei,
    rewardInWei,
    jsonRpc
  );

  return runTransaction(privateKey, distributeTransactionConfig, jsonRpc);
};

/**
 *  pays out the previously specified rewards to the participants in the given mission
 * command: !pay <missionID>
 * args
 * 0 - missionID (optional)
 *
 * @param {string[]} args
 * @param {Discord.Message} message
 * @param {Discord.Client} client
 * @param {boolean} automated
 * @param {ethers.ethers.providers.JsonRpcProvider} jsonRpc
 * @returns
 */
exports.payMission = async function (
  args,
  message,
  client,
  automated,
  jsonRpc
) {
  try {
    if (!automated) {
      if (!utils.checkMissionRole(message)) {
        message.channel.send({
          embed: {
            color: c.FAIL_COL,
            description: "Sorry, you do not have the required permission.",
          },
        });
        return;
      }
    }

    var missionName = args[0].toUpperCase();
    if (missionName == undefined) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Please use this format to pay mission: ${prefix}pay m10`,
        },
      });
      return;
    }

    var mission = await db.getMission(missionName);
    if (!mission || !mission.active) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description:
            "Sorry, that mission does not exist or has been archived.",
        },
      });
      return;
    }

    if (!mission.nevm) {
      return utxoPaymission(mission, message, client);
    }

    const creatorWallet = await db.nevm.getNevmWallet(mission.creator);

    const rewardInWei = ethers.utils.parseUnits(mission.reward, "wei");

    const balanceInWei = await jsonRpc.getBalance(creatorWallet.address);

    if (balanceInWei.lt(rewardInWei)) {
      sendNotEnoughBalanceMessage(message, mission);
      return;
    }

    const missionProfiles = await getMissionProfiles(message, missionName);

    if (missionProfiles.length === 0) {
      sendInvalidParticipationMessage(message, mission);
      exports.archiveMission([mission.missionID], message, client, true);
      return;
    }

    const rewardDividedInWei = rewardInWei.div(missionProfiles.length);

    const minimumTipInWei = ethers.utils.parseEther(`${config.tipMin}`);

    if (rewardDividedInWei.lt(minimumTipInWei)) {
      sendInvalidTipMessage(message);
      return;
    }

    const nevmWallets = await Promise.all(
      missionProfiles.map((profile) => db.nevm.getNevmWallet(profile.userID))
    );

    const addressList = nevmWallets.map((wallet) => wallet.address);
    console.log({
      creator: creatorWallet.address,
      addressList,
      rewardDividedInWei,
      rewardInWei,
    });

    const creatorUser = await client.users.fetch(mission.creator);

    await sendPayoutTransactions(
      mission.currencyID,
      creatorWallet.address,
      creatorWallet.privateKey,
      addressList,
      rewardDividedInWei,
      rewardInWei,
      jsonRpc
    )
      .then((response) => {
        console.log(`Mission Payout sent for: ${mission.missionID}!`);
        const explorerLink = utils.getNevmExplorerLink(
          response.hash,
          "transaction",
          "Click Here to View Transaction"
        );
        creatorUser.send({
          embed: {
            color: c.SUCCESS_COL,
            description: `Payout distribution for mission: ${
              mission.missionID
            } for ${ethers.utils.formatEther(rewardInWei)} ${
              mission.currencyID
            }. Please wait for it to be mined.\n${explorerLink}`,
          },
        });
        return response.wait(1);
      })
      .then((receipt) => {
        const explorerLink = utils.getNevmExplorerLink(
          receipt.transactionHash,
          "transaction",
          "Click Here to View Transaction"
        );
        sendPayoutmessage(
          client,
          ethers.utils.formatEther(rewardInWei),
          ethers.utils.formatEther(rewardDividedInWei),
          mission.currencyID,
          mission.missionID,
          missionProfiles.map((profile) => profile.userID),
          `\n\n${explorerLink}`
        );

        exports.archiveMission(args, message, client, true);
      });
  } catch (error) {
    console.log(error);
    message.channel.send({
      embed: { color: c.FAIL_COL, description: "Error paying mission." },
    });
  }
};

// archives a specific mission, i.e. it's no longer active and participants can't be added to it
/**
 * command: !archive <missionID>
 * args
 * 0 - missionID (optional)
 */
exports.archiveMission = async function (args, message, client, automated) {
  try {
    if (!automated) {
      if (!utils.checkMissionRole(message)) {
        message.channel.send({
          embed: {
            color: c.FAIL_COL,
            description: "Sorry, you do not have the required permission.",
          },
        });
        return;
      }
    }

    var missionName = args[0];
    if (missionName == undefined) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description: `Sorry, you must specify a mission name to archive, i.e. ${prefix}archive m75`,
        },
      });
      return;
    }

    missionName = missionName.toUpperCase();
    var mission = await db.getMission(missionName);
    if (!mission) {
      message.channel.send({
        embed: {
          color: c.FAIL_COL,
          description:
            "Sorry, that mission does not exist or has been archived.",
        },
      });
      return;
    }

    var missionUpdated = await db.archiveMission(missionName);

    if (missionUpdated) {
      message.channel.send({
        embed: {
          color: c.SUCCESS_COL,
          description:
            ":fireworks: The following mission has been archived: **" +
            missionName +
            "**",
        },
      });
    } else {
      message.channel.send({
        embed: { color: c.FAIL_COL, description: "Mission archiving failed." },
      });
    }
  } catch (error) {
    console.log(error);
    message.channel.send({
      embed: { color: c.FAIL_COL, description: "Error archiving mission." },
    });
  }
};

// gets any missions that will be ending within the given limit
// limit is the time given in mins that an auction will be ending by
exports.getEndingSoon = async function getEndingSoon(limit) {
  try {
    var missions = await db.getAllActiveMissions();

    if (!missions || missions === undefined) {
      console.log("Error - cannot fetch active missions to check end times");
    }

    var missionsEnding = [];

    for (var i = 0; i < missions.length; i++) {
      var now = new BigNumber(Date.now());
      var end = new BigNumber(missions[i].endTime.getTime());
      var diff = end.minus(now);

      var secsLeft = diff.dividedBy(1000);

      if (secsLeft.lte(limit)) {
        missionsEnding.push(missions[i]);
      }
    }

    return missionsEnding;
  } catch (error) {
    console.log(error);
  }
};

exports.reportSubmit = async (message) => {
  try {
    const missionName = message.content.trim().split(/\s+/);
    missionName[0] = missionName[0].toUpperCase();
    var mission = await db.getMission(missionName[0]);
    if (mission) {
      if (mission.active) {
        try {
          if (mission.nevm) {
            const wallet = await db.nevm.getNevmWallet(message.author.id);
            if (!wallet) {
              const infoMessage = await message.reply({
                embed: {
                  description: `It seems you don't have an NEVM wallet for this Mission.`,
                },
              });
              await registerWallet(message.author.id);
              await infoMessage.reply({
                embed: {
                  color: c.SUCCESS_COL,
                  description: `Automatically created your NEVM Wallet. Please run \`!deposit nevm\` to check your addresss.`,
                },
              });
            }
          }

          let missionUpdated = await db.addProfileToMission(
            message.author.id,
            missionName[0]
          );
          utils.isSuccessMsgReact(true, message);
          console.log(`Added ${message.author.id} to mission ${missionName}`);
        } catch (error) {
          utils.isSuccessMsgReact(false, message);
          console.log(
            `Error adding ${message.author.id} to mission ${missionName}`
          );
          console.log(error);
        }
      } else {
        utils.isSuccessMsgReact(false, message);
        message.channel
          .send({
            embed: {
              color: c.FAIL_COL,
              description: `Mission ${missionName[0]} is no longer active.`,
            },
          })
          .then((msg) => {
            utils.deleteMsgAfterDelay(msg, 15000);
          });
      }
    } else {
      console.log(`Mission ${missionName} not found`);
    }
  } catch (error) {
    utils.isSuccessMsgReact(false, message);
    console.log(error);
    message.channel
      .send({
        embed: {
          color: c.FAIL_COL,
          description: "Error adding to mission.",
        },
      })
      .then((msg) => {
        utils.deleteMsgAfterDelay(msg, 15000);
      });
  }
};
