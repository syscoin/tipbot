var mongoose = require('mongoose');
var ObjectId = mongoose.Schema.Types.ObjectId;

var MissionSchema = new mongoose.Schema({
  missionID: { type: String, unique: true, dropDups: true },
  reward: { type: String },
  currencyID: { type: String, unique: false },
  profiles: [{ type: ObjectId, ref: 'Profile' }],
  dateCreated: { type: Date },
  active: { type: Boolean }
});

Mission = mongoose.model('missions', MissionSchema);

module.exports = Mission;
