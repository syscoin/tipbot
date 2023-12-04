var mongoose = require('mongoose');
var ObjectId = mongoose.Schema.Types.ObjectId;

var GiveawaySchema = new mongoose.Schema({
  giveawayID: { type: String, unique: true, dropDups: true },
  reward: { type: String },
  participants: [{ type: ObjectId, ref: 'Profile' }],
  winners: [{ type: ObjectId, ref: 'Profile' }],
  dateCreated: { type: Date },
  endTime: { type: Date },
  active: { type: Boolean },
  messageId: { type: String },
  channelId: { type: String },
  authorId: { type: String },
  expectedWinnerCount: { type: Number },
});

Giveaway = mongoose.model('giveaways', GiveawaySchema);

module.exports = Giveaway;
