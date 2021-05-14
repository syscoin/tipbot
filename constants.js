//Changing variable - Only for prefix code
const config = require('./config.json')
const prefix = config.prefix

//Constant variables - Will not and should not be changed in the code
function getHelpCommands(parm) {
  switch(parm) {
    case "main":
    return `
      **Main Commands**
      ~~--------------------~~
      **\`${prefix}register\`**  Creates a ${config.botname} profile to send/receive ${config.ctick} and Syscoin Platform Tokens (SPTs)!

      **\`${prefix}balance\`**  Views your current ${config.ctick} and SPT balances.

      **\`${prefix}deposit\`**  Gets your ${config.ctick} deposit address.

      **\`${prefix}withdraw [address] [amount] [symbol/guid]\`**  Withdraw ${config.ctick} or SPTs to your personal wallet address.

      **\`${prefix}tip @user [amount] [symbol/guid]\`**  Send some ${config.ctick} or SPTs to another user.

      **\`${prefix}foundation\`**  Find out more about the Syscoin Foundation.

          `;
    break

    case "trade":
      return `
        **Trade Commands**
        ~~--------------------~~
        **\`${prefix}trade [amount] [symbol/guid] for [amount] [symbol/guid] with @user\`**  Creates a trade for the given tokens with the specified user. The trade will be cancelled after ${config.tradeTime} minutes.

        **\`${prefix}accept [trade ID]\`** Accepts the trade with the given trade ID.

        **\`${prefix}cancel [trade ID]\`**  Cancels the trade with the given trade ID.

        **\`${prefix}recent <symbol/guid>\`**  Lists some recent trades. Symbol/guid is optional; if included the list will only show trades with those tokens.

            `;
      break

    case "auction":
      return `
        **Auction Commands**
        ~~--------------------~~
        **\`${prefix}auction [amount] [token] [timeAmount][m/h/d] [reserveAmount]\`**  Creates an auction with the specified variables.

        **\`${prefix}bid [auction ID] [amount]\`** Bids on the specified auction for the given amount of ${config.ctick}.

        **\`${prefix}cancel [auction ID]\`**  Cancels the auction with the given auction ID (if there are no bids).

        **\`${prefix}show [auction ID]\`**  Shows the given auction with all it's information.

        **\`${prefix}find [symbol/guid]\`**  Finds and returns some of the auctions with the given token, ending soonest.

        **\`${prefix}findold [symbol/guid]\`**  Finds and returns some of the auctions with the given token that ended most recently.

        **\`${prefix}list\`**  Finds and returns some of the auctions that are ending soonest.

            `;

    case "mission":
    return `

      **Mission Commands**
      ~~------------~~

      NOTE: With great power, comes great responsibility.

      You must be a member of the role **${config.discordAdminRole}** to perform these commands. Also, these can only be performed in a bot channel (no DMs).

      **\`${prefix}create [missionName] [payout] [symbol/guid] [timeAmount][s/m/h/d] <@suggester> <suggesterPayout>\`** Create a new mission with the given name, payout, symbol/guid and time limit, suggester and suggesterPayout optional

      **\`${prefix}edit [missionName] [payout] [symbol/guid] [timeAmount][s/m/h/d] <@suggester> <suggesterPayout>\`** Edit an existing mission with the given name, payout, symbol/guid and time limit, suggester and suggesterPayout optional

      **\`${prefix}add [missionName] @user\`** Adds a user to a mission i.e. they will receive the payout.

      **\`${prefix}remove [missionName] @user\`** Removes a user from a mission i.e. they will no longer receive the payout.

      **\`${prefix}list <missionName>\`** Lists all users in the given mission.

      **\`${prefix}pay [missionName]\`** Pays all users that have participated in the given mission.

      **\`${prefix}archive [missionName]\`** Archives the given mission.

      **\`${prefix}missions\`** Lists all active missions.

      **\`${prefix}missionarchive\`** Lists all archived missions.

      `;

      break

    case "admin":
      return `

      **Admin Commands**
      ~~------------~~

      NOTE: With great power, comes great responsibility.

      You must be a member of the role **${config.discordAdminRole}** to perform admin commands. Also, these can only be performed in a bot channel (no DMs).

      **\`${prefix}restrict @user\`**  Restrict a user.  The user will receive a DM.

      **\`${prefix}unrestrict @user\`**  Unrestrict a user. The user will receive a DM notifying them to follow the rules.

      **\`${prefix}check @user\`**  Check if a user is restricted.

      **\`${prefix}giveaway [timeAmount][s/m] [winnersAmount][w] [payout] [symbol/guid]\`** Creates a giveaway with the specified parameters.

      **\`${prefix}verifytoken [guid] [chosenSymbol] <linkToNFT>\`** Verify a SPT so users can refer to it using the chosen symbol rather than guid. If a link to the NFT is included, the NFT will be embedded within auctions/trades/giveaways.

      `;
    break
    default:
  }
}

module.exports = {
    help: getHelpCommands
}
