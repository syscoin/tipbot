const mongoose = require("mongoose");
const ObjectId = mongoose.Schema.Types.ObjectId;

const MissionSchema = new mongoose.Schema({
  missionID: { type: String, unique: true, dropDups: true },
  creator: { type: String },
  reward: { type: String },
  suggesterID: { type: String },
  suggesterPayout: { type: String },
  currencyID: { type: String, unique: false },
  profiles: [{ type: ObjectId, ref: "Profile" }],
  dateCreated: { type: Date },
  endTime: { type: Date },
  active: { type: Boolean },
  nevm: { type: Boolean },
});

Mission = mongoose.model("missions", MissionSchema);

module.exports = Mission;
