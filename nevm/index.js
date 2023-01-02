const { registerNevm } = require("./register");
const deposit = require("./deposit");
const balance = require("./balance");
const withdraw = require("./withdraw");
const send = require("./send");
module.exports = {
  register: registerNevm,
  deposit,
  balance,
  withdraw,
  send,
};
