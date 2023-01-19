const config = require('../../config.json');

/**
 * Extracts Command and Arguments from message content
 * @param {Discord.Message} message
 */
function extractCommandAndArguments(message) {
  const splitter = message.content.replace(" ", ":splitter185151813367::");
  const fixspaces = splitter.replace(
    ":splitter185151813367:::splitter185151813367::",
    ":splitter185151813367::"
  );
  const splitted = fixspaces.split(":splitter185151813367::");

  //  const splitted = splitter.split(":splitter185151813367::")
  const prefix = config.prefix;
  const fixRegExp = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(fixRegExp);
  const command = splitted[0].replace(re, "");
  const args = splitted[1]
    ? splitted[1].split(" ").filter((a) => a.length !== 0)
    : [];
  return {
    command,
    args,
  };
}

module.exports = {
  extractCommandAndArguments,
};
