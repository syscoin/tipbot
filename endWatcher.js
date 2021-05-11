/**
* Watches for auctions that will be ending soon and ensures that they are
* ended at the right time.
*/


var exports = module.exports = function(client) {
  var module = {}

  const auctions = require('./auctions.js')
  const db = require('./db.js')

  const auctionsJS = require('./auctions.js')
  const tradesJS = require('./trades.js')
  const missionsJS = require('./missions.js')
  const utils = require('./utils.js')
  const config = require('./config.json')

  const BigNumber = require('bignumber.js')
  BigNumber.config({ DECIMAL_PLACES: 8 })
  BigNumber.config({ EXPONENTIAL_AT: 1e+9 })

  var intervals = []

  async function checkAndEndAuction(auctionID) {
    try {
      var now = Date.now()
      var auction = await db.getAuction(auctionID)

      if (auction) {
        if (now >= auction.endTime.getTime()) {
          auctionsJS.endAuction(auctionID, client)
          clearInterval(intervals[auctionID])
        }
      }
    } catch (error) {
      console.log(error)
    }
  }

  async function checkAndEndTrade(tradeID) {
    try {
      var now = Date.now()
      var trade = await db.getTrade(tradeID)

      if (trade) {
        if (now >= trade.endTime.getTime() && trade.completedTime === null) {
          var channel = client.channels.cache.get(config.tradeChannel)
          var message = Array.from(await channel.messages.fetch({limit: 1}))[0][1]

          console.log("deleting " + tradeID)
          tradesJS.endTrade(message, trade.tradeID, true)
          clearInterval(intervals[tradeID])
        }
      }
    } catch (error) {
      console.log(error)
    }
  }

  async function checkAndEndMission(missionID) {
    try {
      var now = Date.now()

      var mission = await db.getMission(missionID)

      if (mission) {
        if (now >= mission.endTime.getTime()) {
          var channel = client.channels.cache.get(config.missionPayOutsChannel)
          var message = Array.from(await channel.messages.fetch({limit: 1}))[0][1]

          console.log("paying mission " + missionID)
          missionsJS.payMission([mission.missionID], message, client, true)
          clearInterval(intervals[missionID])
        }
      }
    } catch (error) {
      console.log(error)
    }
  }



  // checks for auctions/trades/missions ending within a certain time and for those that will it
  // then adds a higher frequency interval to ensure they end at the right time
  async function checkEnding() {
    try {
      // ending within 2 minutes
      var endingAuctions = await auctionsJS.getEndingSoon(120)

      if (endingAuctions) {
        for (var i = 0; i < endingAuctions.length; i++) {
          var interval = intervals[endingAuctions[i].auctionID]

          if (interval == undefined) {
            intervals[endingAuctions[i].auctionID] = setInterval(checkAndEndAuction, 5000, endingAuctions[i].auctionID)
          }
        }
      }

      var endingTrades = await tradesJS.getEndingSoon(60)

      if (endingTrades) {
        for (var i = 0; i < endingTrades.length; i++) {
          var interval = intervals[endingTrades[i].tradeID]

          if (interval == undefined) {
            intervals[endingTrades[i].tradeID] = setInterval(checkAndEndTrade, 5000, endingTrades[i].tradeID)
          }
        }
      }

      var endingMissions = await missionsJS.getEndingSoon(120)

      if (endingMissions) {
        for (var i = 0; i < endingMissions.length; i++) {
          var interval = intervals[endingMissions[i].missionID]

          if (interval == undefined) {
            intervals[endingMissions[i].missionID] = setInterval(checkAndEndMission, 5000, endingMissions[i].missionID)
          }
        }
      }
    } catch (error) {
      console.log(error)
    }
  }

  // check every 90 secs
  setInterval(checkEnding, 10000)
}
