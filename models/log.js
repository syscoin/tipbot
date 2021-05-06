var mongoose = require('mongoose');
var ObjectId = mongoose.Schema.Types.ObjectId;

var LogSchema = new mongoose.Schema({
  userID: { type: String },
  action: { type: String },
  targets: [{ type: String }],
  amount: { type: String },
  date: { type: Date }
});

Log = mongoose.model('logs', LogSchema);

module.exports = Log;
