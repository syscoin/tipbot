var mongoose = require('mongoose');
var ObjectId = mongoose.Schema.Types.ObjectId;

var TradeSchema = new mongoose.Schema({
  tradeID: { type: String, unique: true, dropDups: true },
  userA: { type: String },
  userB: { type: String },
  tokenA: { type: String },
  tokenB: { type: String },
  amountA: { type: String },
  amountB: { type: String },
  createdTime: { type: Date },
  completedTime: { type: Date },
  endTime: { type: Date }
});

Trade = mongoose.model('trades', TradeSchema);

module.exports = Trade;
