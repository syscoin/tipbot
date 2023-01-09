var LocalStorage = require("node-localstorage").LocalStorage;
localStorage = new LocalStorage("../../ls");
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
  console.log({ savedNonce: nonce });
  const latestNonce = parseInt(
    await jsonRpc.getTransactionCount(address, "pending"),
    10
  );
  if (!nonce || nonce < latestNonce) {
    nonce = latestNonce;
  }
  set(address, nonce + 1);
  return nonce;
};

module.exports = {
  getLatestNonce,
};
