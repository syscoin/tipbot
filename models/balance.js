var mongoose = require('mongoose');
const sjs = require('syscoinjs-lib')
const BN = sjs.utils.BN
var ObjectId = mongoose.Schema.Types.ObjectId;

var BalanceSchema = new mongoose.Schema({
  userID: { type: String, unique: false },
  currencyID: { type: String, unique: false },
  amount: { type: String },
  lockedAmount: { type: String }
});

BalanceSchema.index({ userID: 1, currencyID: 1 }, { unique: true });

Balance = mongoose.model('balances', BalanceSchema);

module.exports = Balance;
