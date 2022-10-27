const db = require("../db");
const constants = require("../c.json");
const config = require("../config.json");
const qr = require("../qr");
const Discord = require("discord.js");
/**
 * Show deposit address and QR code for NEVM
 * @param {Discord.Message} message Discord message
 */
async function deposit(message) {
  const userId = message.author.id;
  const profile = await db.getProfile(userId);
  if (!profile) {
    return message.channel.send({
      embed: {
        color: constants.FAIL_COL,
        description:
          "You don't have a profile yet. Use `!register` to create one.",
      },
    });
  }

  const nevmWallet = await db.nevm.getNevmWallet(userId);
  if (!nevmWallet) {
    return message.channel.send({
      embed: {
        color: constants.FAIL_COL,
        description:
          "You don't have a nevm wallet yet. Use `!register nevm` to create one.",
      },
    });
  }

  const desc =
    `Hi, **<@${message.author.id}>** Any coins/tokens sent to this address will be added to your ${config.botname} balance within a few minutes.` +
    `\n\n:warning: IMPORTANT: Make sure that all transactions sent to this deposit address have been confirmed at least once before using the !balance command, otherwise your funds might be lost. :warning:\n\nYour personal deposit address:\n\n${nevmWallet.address}`;

  let attachment = null;
  try {
    const qrPath = await qr.getNevmQR(profile.userID);
    attachment = new Discord.MessageAttachment(qrPath);
  } catch (error) {
    console.log("Error getting qrpath");
    console.log(error);
  }

  const embed = new Discord.MessageEmbed()
    .setColor(constants.SUCCESS_COL)
    .setDescription(desc);

  if (attachment) {
    embed
      .attachFiles(attachment)
      .setImage(`attachment://${message.author.id}-nevm.png`);
  }

  message.author.send(embed);
}

module.exports = deposit;
