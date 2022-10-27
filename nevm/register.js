const db = require("../db");
const constants = require("../c.json");
const config = require("../config.json");
const utils = require("../utils");
const HDWallet = require("ethereum-hdwallet");

const tipbotWallet = HDWallet.fromMnemonic(config.nevm.mnemonic).derive(
  HDWallet.DefaultHDPath
);

/**
 *
 * @param {Discord.Client} client
 * @param {Discord.Message} message
 * @param {string[]} args
 */
async function registerNevm(client, message, args) {
  const userId = message.author.id;
  let nevmWallet = await db.nevm.getNevmWallet(userId);
  if (nevmWallet) {
    message.channel
      .send({
        embed: {
          color: constants.FAIL_COL,
          description:
            "You already registered for NEVM on your " +
            config.botname +
            " profile.",
        },
      })
      .then((msg) => {
        utils.deleteMsgAfterDelay(msg, 15000);
      });
    return;
  }
  const count = await db.nevm.getNevmWalletCount();
  const newWallet = tipbotWallet.derive(count);

  nevmWallet = await db.nevm.createNevmWallet(
    message.author.id,
    `0x${newWallet.getAddress().toString("hex")}`,
    `0x${newWallet.getPrivateKey().toString("hex")}`
  );

  if (!nevmWallet) {
    console.error("registerNevm", "Wallet creation failed");
    return;
  }

  const user = await client.users.fetch(message.author.id);
  user.send({
    embed: {
      color: constants.SUCCESS_COL,
      description: `You have successfully registered for NEVM on your ${config.botname} profile.\n`,
    },
  });
}

module.exports = registerNevm;
