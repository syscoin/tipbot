var mongoose = require('mongoose');

var BidSchema = new mongoose.Schema({
  bidder: { type: String },
  amount: { type: String },
});

Bid = mongoose.model('bids', BidSchema);

module.exports = Bid;
