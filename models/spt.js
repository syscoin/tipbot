var mongoose = require('mongoose');
var ObjectId = mongoose.Schema.Types.ObjectId;

var SPTSchema = new mongoose.Schema({
  symbol: { type: String, unique: true, dropDups: true },
  guid: { type: String }
});

SPT = mongoose.model('spts', SPTSchema);

module.exports = SPT;
