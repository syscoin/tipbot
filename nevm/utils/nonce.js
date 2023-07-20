var LocalStorage = require("node-localstorage").LocalStorage;
localStorage = new LocalStorage("../../ls");
const Log = require("../../log");
var nonceMap = require("../../ls");

const get = (address) => {
  const key = `nonce_${address}`;
  if (!nonceMap.get(key)) {
    return null;
  }
  const parseNonce = parseInt(nonceMap.get(key), 10);
  return parseNonce;
};

const set = (address, value) => {
  const key = `nonce_${address}`;
  nonceMap.set(key, value);
};

const getLatestNonce = async (address, jsonRpc) => {
  let nonce = get(address);
  const pendingNonce = parseInt(
    await jsonRpc.getTransactionCount(address, "pending"),
    10
  );
  Log.debug({ savedNonce: nonce, pendingNonce });
  if (!nonce || nonce < pendingNonce) {
    nonce = pendingNonce;
  } else if (nonce - pendingNonce > 1) {
    nonce = pendingNonce;
  }
  Log.debug({finalNonce: nonce});
  set(address, nonce + 1);
  return nonce;
};

module.exports = {
  getLatestNonce,
};
