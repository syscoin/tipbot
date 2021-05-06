var mongoose = require('mongoose');
var ObjectId = mongoose.Schema.Types.ObjectId;

var ProfileSchema = new mongoose.Schema({
  userID: { type: String, unique: true, dropDups: true },
  address: { type: String },
  balances: [{ type: ObjectId, ref: 'Balance' }],
  restricted: { type: Boolean },
  logs: [{ type: ObjectId, ref: 'Log' }]
});

Profile = mongoose.model('profiles', ProfileSchema);

module.exports = Profile;
