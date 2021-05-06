var mongoose = require('mongoose');
var ObjectId = mongoose.Schema.Types.ObjectId;

var AuctionSchema = new mongoose.Schema({
  auctionID: { type: String, unique: true, dropDups: true },
  seller: { type: String },
  winner: { type: String },
  token: { type: String },
  tokenAmount: { type: String },
  reservePrice: { type: String },
  bids: [{ type : ObjectId, ref: 'Bid' }],
  endAmount: { type: String },
  createdTime: { type: Date },
  endTime: { type: Date },
  completed: { type: Boolean },
  ended: { type: Boolean }
});

Auction = mongoose.model('auctions', AuctionSchema);

module.exports = Auction;
