const mongoose = require('mongoose');

const NevmWalletSchema = new mongoose.Schema({
  userId: { type: String, unique: true, dropDups: true },
  privateKey: { type: String },
  address: { type: String },
});

const NevmWallet = mongoose.model('nevmwallets', NevmWalletSchema);

module.exports = NevmWallet;
