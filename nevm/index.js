const { registerNevm } = require("./register");
const deposit = require("./deposit");
const balance = require("./balance");
const withdraw = require("./withdraw");
const { send } = require("./send");
const {
  createGiveAway,
  resumeActiveGiveaways,
  startGiveawayTimer,
} = require("./giveaway");
module.exports = {
  register: registerNevm,
  deposit,
  balance,
  withdraw,
  send,
  createGiveAway,
  resumeActiveGiveaways,
  startGiveawayTimer,
};
