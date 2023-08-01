var exports = module.exports = {};
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const sjs = require('syscoinjs-lib')
const BigNumber = require('bignumber.js')
BigNumber.config({ DECIMAL_PLACES: 8 })
BigNumber.config({ EXPONENTIAL_AT: 1e+9 })

const config = require('./config.json')

// import mongoose models
const Auction = require('./models/auction.js')
const Bid = require('./models/bid.js')
const Balance = require('./models/balance.js');
const Giveaway = require('./models/giveaway.js');
const Log = require('./models/log.js');
const Mission = require('./models/mission.js');
const Profile = require('./models/profile.js');
const SPT = require('./models/spt.js')
const Trade = require('./models/trade.js');
const NevmWallet = require('./models/nevm-wallet');

const mongodbhost = process.env.MONGODB_HOST ?? 'mongodb://localhost';

exports.connect = function() {
  try {
    var dbStr = "sys-main"
    if (config.testnet) {
      dbStr = "test"
    }

    mongoose.connect(`${mongodbhost}/${dbStr}`,
        {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          useFindAndModify: false,
          useCreateIndex: true
        }).catch(err => {

          console.error('Connection Error:', err)
          console.log('Exiting: Could not connect to MongoDB');
          process.exit(1);
        });
  } catch (error) {
    console.log(error)
  }

  var db = mongoose.connection;
  db.on('error', console.error.bind(console, 'connection error:'));
}

// adds a new profile to the db
exports.createProfile = function(discordID, addy) {
  try {
    return Profile.create({
      userID: discordID,
      address: addy,
      balances: new Array(),
      restricted: false
    });
  } catch (error) {
    console.log(error)
    return null
  }
}

// function to edit the details of a profile
exports.editProfile = function(discordID, addy, restriction) {
  try {
    return Profile.findOneAndUpdate({ userID: discordID },
                            { address: addy, restricted: restriction },
                            { new: true });
  } catch (error) {
    console.log(error)
    return null
  }
}

// function to edit the address of a profile
exports.editProfileAddress = function(discordID, addy) {
  try {
    return Profile.findOneAndUpdate({ userID: discordID },
                            { address: addy },
                            { new: true });
  } catch (error) {
    console.log(error)
    return null
  }
}

// creates and adds a log to a profile
exports.addLogToProfile = async function(discordID, id, action, amount, targets) {
  try {
    let log = await Log.create({
        userID: id,
        action: action,
        amount: amount,
        targets: targets
      });
    let profile = await Profile.findOneAndUpdate({ userID: discordID },
      { $addToSet: { logs : log._id }}, { new: true });
    return log
  } catch (error) {
    console.log(error)
    return null
  }
}

// function to find a specific profile
exports.getProfile = function(discordID) {
  try {
    return Profile.findOne({ userID: discordID });
  } catch (error) {
    console.log(error)
    return null
  }
}

// function to return all profiles in the db
exports.getProfiles = function() {
  try {
    return Profile.find({ });
  } catch (error) {
    console.log(error)
    return null
  }
}

// creates and adds a balance to a profile
exports.createBalance = async function(discordID, currencyID, value) {
  try {
    let balance = await Balance.create({
        userID: discordID,
        currencyID: currencyID,
        amount: value.toString(),
        lockedAmount: "0"
      });
    let profile = await Profile.findOneAndUpdate({ userID: discordID },
      { $addToSet: { balances : balance._id }});
    return balance
  } catch (error) {
    console.log(error)
    return null
  }
}

// function to edit the balance of a coin/token in a specific profile
exports.editBalanceAmount = function(discordID, coinOrTokenID, value) {
  try {
    return Balance.findOneAndUpdate({ userID: discordID, currencyID: coinOrTokenID },
                            { amount: value.toString() }, { new: true });
  } catch (error) {
    console.log(error)
    return null
  }
}

// function to edit the locked balance of a coin/token in a specific profile
exports.editBalanceLocked = function(discordID, coinOrTokenID, value) {
  try {
    return Balance.findOneAndUpdate({ userID: discordID, currencyID: coinOrTokenID },
                            { lockedAmount: value.toString() }, { new: true });
  } catch (error) {
    console.log(error)
    return null
  }
}

// function to find the balance of a coin/token in a specific profile
// tokens stored under their guid
exports.getBalance = function(discordID, coinOrTokenID) {
  try {
    return Balance.findOne({ userID: discordID, currencyID: coinOrTokenID});
  } catch (error) {
    console.log(error)
    return null
  }
}

// find all balances held by a specific profile
exports.getBalances = function(discordID) {
  try {
    let bals = Balance.find({ userID: discordID, amount: { $gt: 0 } });
    if (!bals) {
      return []
    } else {
      return bals
    }
  } catch (error) {
    console.log(error)
    return null
  }
}

// creates a new mission in the db
exports.createMission = function (
  id,
  creator,
  payout,
  currency,
  endDate,
  suggesterID,
  suggesterPayout
) {
  try {
    let data = {
      missionID: id,
      creator: creator,
      reward: payout.toString(),
      currencyID: currency.toString(),
      profiles: new Array(),
      dateCreated: new Date(),
      endTime: endDate,
      active: true,
      nevm: true
    };
    if (suggesterID && suggesterPayout) {
      data = {
        ...data,
        suggesterID: suggesterID,
        suggesterPayout: suggesterPayout.toString(),
      };
    }
    return Mission.create(data);
  } catch (error) {
    console.log(error);
    return null;
  }
};

// edits a mission in the db
exports.editMission = function(id, payout, currency, endDate, suggesterID, suggesterPayout) {
  if (suggesterID && suggesterPayout) {
    try {
      return Mission.findOneAndUpdate({ missionID: id },
        {
          reward: payout.toString(),
          suggesterID: suggesterID,
          suggesterPayout: suggesterPayout.toString(),
          currencyID: currency.toString(),
          endTime: endDate,
          active: true
        },
        { new: true });
    } catch (error) {
      console.log(error)
      return null
    }
  } else {
    try {
      return Mission.findOneAndUpdate({ missionID: id },
        {
          reward: payout.toString(),
          currencyID: currency.toString(),
          endTime: endDate,
          active: true
        },
        { new: true });
    } catch (error) {
      console.log(error)
      return null
    }
  }
}

// finds a mission with the given name
exports.getMission = function(id) {
  try {
    return Mission.findOne({ missionID: id });
  } catch (error) {
    console.log(error)
    return null
  }
}

// finds and returns all active missions
exports.getAllActiveMissions = function() {
  try {
    return Mission.find({ active: true });
  } catch (error) {
    console.log(error)
    return null
  }
}

// finds and returns all active missions
exports.getAllArchivedMissions = function() {
  try {
    return Mission.find({ active: false });
  } catch (error) {
    console.log(error)
    return null
  }
}

// adds a profile to a specific mission
exports.addProfileToMission = async function(discordID, missID) {
  try {
    let profile = await Profile.findOne({
        userID: discordID
      });
    if (profile) {
      return Mission.findOneAndUpdate({ missionID: missID },
        { $addToSet: { profiles : profile._id }}, { new: true });
    } else {
      return null
    }
  } catch (error) {
    console.log(error);
    return null
  }
}

// removes a specific profile from a specific mission
exports.removeProfileFromMission = async function(discordID, missionID) {
  try {
    let profile = await Profile.findOne({ userID: discordID });
    if (profile) {
      return Mission.findOneAndUpdate({ missionID: missionID },
        { $pull: { profiles : profile._id }}, { new: true });
    } else {
      return null
    }
  } catch (error) {
    console.log(error);
    return null
  }
}

// checks if a specific profile is in a specific mission
exports.checkProfileInMission = async function(discordID, missionID) {
  try {
    var mission = await Mission.findOne({ missionID: missionID })
                        .populate({ path: 'profiles', model: Profile });

    for (var i = 0; i < mission.profiles.length; i++) {
      if (mission.profiles[i].userID === discordID) {
        return true
      }
    }
    return false
  } catch (error) {
    console.log(error);
    return null
  }
}

// finds and returns all profiles in a mission
exports.getMissionProfiles = async function(missID) {
  try {
    var mission = await Mission.findOne({ missionID: missID })
                        .populate({ path: 'profiles', model: Profile });
    if (mission) {
      return mission.profiles
    } else {
      return null
    }
  } catch (error) {
    console.log(error)
    return null
  }
}

// function to archive a specific mission
exports.archiveMission = function(id) {
  try {
    return Mission.findOneAndUpdate({ missionID: id },
                            { active: false }, { new: true });
  } catch (error) {
    console.log(error)
    return null
  }
}

// adds a new "verified" SPT to the db, this links to the guid
// for using with the fetchBackednAsset function
exports.createSPT = function(symbol, guid, link) {
  try {
    return SPT.create({
      symbol: symbol.toUpperCase(),
      guid: guid,
      linkToNFT: link
    });
  } catch (error) {
    console.log(error)
    return null
  }
}

// finds a SPT with the given identifier, can be either symbol or guid
exports.getSPT = function (identifier) {
  try {
    return SPT.findOne({ $or: [{symbol: identifier.toUpperCase()}, {guid: identifier}] });
  } catch (error) {
    console.log(error)
    return null
  }
}

// adds a new log to the db
exports.createLog = function(discordID, action, targets, value) {
  try {
    return Log.create({
      userID: discordID,
      action: action,
      targets: targets,
      amount: value,
      date: new Date()
    });
  } catch (error) {
    console.log(error)
    return null
  }
}

// creates a new giveaway in the db
exports.createGiveaway = function(id, payout, currencyID, endTime) {
  try {
    return Giveaway.create({
      giveawayID: id,
      reward: payout,
      currencyID: currencyID,
      participants: new Array(),
      winners: new Array(),
      dateCreated: new Date(),
      endTime: endTime,
      active: true
    });
  } catch (error) {
    console.log(error)
    return null
  }
}

// finds and returns the giveaway with the given id
exports.getGiveaway = function(id) {
  try {
    return Giveaway.findOne({ giveawayID: id });
  } catch (error) {
    console.log(error)
    return null
  }
}

// finds and ends the giveaway with the given id
exports.endGiveaway = function(id) {
  try {
    return Giveaway.findOneAndUpdate({ giveawayID: id },
            { active: false },
            { new: true});
  } catch (error) {
    console.log(error)
    return null
  }
}

// get count of giveaways
exports.getGiveawayCount = function() {
  try {
    return Giveaway.countDocuments();
  } catch (error) {
    console.log(error)
    return null
  }
}

// creates a new trade in the db
exports.createTrade = function(trade_id, id_a, id_b, token_a, token_b, amount_a, amount_b, end) {
  try {
    return Trade.create({
      tradeID: trade_id,
      userA: id_a,
      userB: id_b,
      tokenA: token_a,
      tokenB: token_b,
      amountA: amount_a,
      amountB: amount_b,
      createdTime: new Date(),
      completedTime: null,
      endTime: end
    });
  } catch (error) {
    console.log(error)
    return null
  }
}

// finds and returns a trade with the given id
exports.getTrade = function(id) {
  try {
    return Trade.findOne({ tradeID: id });
  } catch (error) {
    console.log(error)
    return null
  }
}

// Completes a specific trade
exports.completeTrade = function(id) {
  try {
    return Trade.findOneAndUpdate({ tradeID: id },
                            { completedTime: new Date() }, { new: true });
  } catch (error) {
    console.log(error)
    return null
  }
}

// Deletes a specific trade
exports.deleteTrade = function(id) {
  try {
    return Trade.deleteOne({ tradeID: id });
  } catch (error) {
    console.log(error)
    return null
  }
}

// Returns the list of live trades
exports.getLiveTrades = async function() {
  try {
    var trades = await Trade.aggregate(
    [
      { $match:
        { "completedTime": { $eq: null}}
      },
      { $sort: { endTime: -1 } }
    ]);

    if (trades) {
      return trades
    } else {
      return null
    }
  } catch (error) {
    console.log(error)
    return null
  }
}

// Returns the most recent x number of completed trades
exports.getRecentTrades = async function(tradeCount) {
  try {
    var trades = await Trade.aggregate(
    [
      { $match:
        { "completedTime": { $ne: null}}
      },
      { $sort: { completedTime: -1 } },
      { $facet: {
        results: [{ $skip: 0 }, { $limit: tradeCount }],
        count: [{ $count: 'count' }]
      } }
    ]);

    if (trades[0]) {
      return trades[0].results
    }
  } catch (error) {
    console.log(error)
    return null
  }
}

// Returns the most recent x number of completed trades of a specific token
exports.getRecentTokenTrades = async function(token, tradeCount) {
  try {
    var trades = await Trade.aggregate(
    [
      { $match:
        { $and:
          [
            { $or:
              [
                { "tokenA": token },
                { "tokenB": token }
              ]
            },
            { "completedTime": { $ne: null}}
          ]
        }
      },
      { $sort: { completedTime: -1 } },
      { $facet: {
        results: [{ $skip: 0 }, { $limit: tradeCount }],
        count: [{ $count: 'count' }]
      } }
    ]);

    if (trades[0]) {
      return trades[0].results
    }
  } catch (error) {
    console.log(error)
    return null
  }
}

// creates a new auction in the db
exports.createAuction = function(auctionID, seller, token, amount, reserve, endTime) {
  try {
    return Auction.create({
      auctionID: auctionID,
      seller: seller,
      winner: null,
      token: token,
      tokenAmount: amount.toString(),
      reservePrice: reserve.toString(),
      bids: new Array(),
      endAmount: null,
      createdTime: new Date(),
      endTime: endTime,
      completed: false,
      ended: false
    });
  } catch (error) {
    console.log(error)
    return null
  }
}

// finds and returns an auction with the given id
exports.getAuction = function(id) {
  try {
    return Auction.findOne({ auctionID: id })
                  .populate({ path: 'bids', model: Bid })
  } catch (error) {
    console.log(error)
    return null
  }
}

// Returns auctions with the given token
exports.getTokenAuctions = function(guid) {
  try {
    return Auction.find({ token: guid, ended: false })
                  .populate({ path: 'bids', model: Bid })
                  .sort({ endTime: 1 })
  } catch (error) {
    console.log(error)
    return null
  }
}

// finds and returns live auctions
exports.getLiveAuctions = function() {
  try {
    return Auction.find({ ended: false })
                  .populate({ path: 'bids', model: Bid })
                  .sort({ endTime: 1 })
  } catch (error) {
    console.log(error)
    return null
  }
}

// Returns auctions with the given token
exports.getOldTokenAuctions = function(guid, auctionCount) {
  try {
    return Auction.find({ token: guid, ended: true })
                  .populate({ path: 'bids', model: Bid })
                  .sort({ endTime: -1 })
                  .limit( auctionCount )
  } catch (error) {
    console.log(error)
    return null
  }
}

// adds a bid to an auction
exports.bidAuction = async function(id, bidder, bidAmount) {
  var bid
  try {
    bid = await Bid.create({
        bidder : bidder,
        amount : bidAmount.toString(),
      })
  } catch (error) {
    console.log(error)
    return null
  }

  try {
    return Auction.findOneAndUpdate({ auctionID : id },
      { $push: { bids : bid }}, { new: true })
      .populate({ path: 'bids', model: Bid })
  } catch (error) {
    console.log(error)
    return null
  }
}

// Ends a specific auction, for example, if it ends with reserve price not being met
exports.endAuction = function(id) {
  try {
    return Auction.findOneAndUpdate({ auctionID: id },
                            {
                              endTime: new Date(),
                              ended: true
                            }, { new: true });
  } catch (error) {
    console.log(error)
    return null
  }
}

// Completes a specific auction with reserve price being met
exports.completeAuction = function(id, endAmount, winner) {
  try {
    return Auction.findOneAndUpdate({ auctionID: id },
                            { endAmount: endAmount.toString(),
                              winner: winner,
                              endTime: new Date(),
                              completed: true,
                              ended: true
                            }, { new: true });
  } catch (error) {
    console.log(error)
    return null
  }
}

// Deletes a specific auction
exports.deleteAuction = function(id) {
  try {
    return Auction.deleteOne({ auctionID: id });
  } catch (error) {
    console.log(error)
    return null
  }
}

/**
 * Get NEVM Wallet
 * @param {string} userId 
 */
function getNevmWallet(userId) {
  try {
    return NevmWallet.findOne({ userId })
  }catch(e) {
    console.log(e);
    return null;
  }
}

/**
 * Creates new entry in NEVM Wallet
 * @param {string} userId Discord user id
 * @param {string} address Ethereum address
 * @param {string} privateKey Ethereum private key
 */
function createNevmWallet(userId, address, privateKey) {
  try {
    return NevmWallet.create({
      userId,
      address,
      privateKey
    })
  }catch(e) {
    console.log(e);
    return null;
  }
}

/**
 * Gets number of NEVM Walelts
 * @returns {Promise<number>}
 */
function getNevmWalletCount() {
  try {
    return NevmWallet.countDocuments();
  } catch (e) {
    console.log(e);
    return null;
  }

}
exports.nevm = {
  getNevmWallet,
  getNevmWalletCount,
  createNevmWallet
}