var exports = module.exports = {}

const config = require('./config.json')

const pe = require('discord-paginationembed')
const { MessageEmbed } = require('discord.js')

// splits to pages for use with pagination
function splitToPages(strArray, itemsPerPage) {
  var spliced = []
  // push auction strings to array based on the page number
  while (strArray.length > 0) {
    spliced.push(strArray.splice(0, itemsPerPage))
  }

  // create MessageEmbed pages for pagination
  var pages = []
  for (var i = 0; i < spliced.length; i++) {
    pages.push(new MessageEmbed)
    pages[i].description = ""
    //pages[i].fields = [{ name: 'Page', value: i + 1, inline: false }]
    for (var j = 0; j < spliced[i].length; j++) {
      pages[i].addField("-----------------------", spliced[i][j], false)
    }
  }

  return pages
}

// creates a pagination embed for displaying auctions/trades with a paged message
exports.createPagination = async function(strArray, title, channel) {
  var embeds = new Array();
  var deleteOnTimeout = true
  var emojisFunctionAfterNavigation = true
  disabledNavigationEmojis = ["delete"]

  var embeds = splitToPages(strArray, config.itemsPerPage)

  const Embeds = new pe.Embeds()
    .setArray(embeds)
    .setChannel(channel)
    .setTitle(title)
    .setPageIndicator(true, 'hybrid')
    .setColor(0x0015FF)
    .setDeleteOnTimeout(deleteOnTimeout)
    .setEmojisFunctionAfterNavigation(emojisFunctionAfterNavigation)
    .setDisabledNavigationEmojis(disabledNavigationEmojis)
    .on('start', () => console.log('Started!'))
    .on('finish', (user) => console.log(`Finished! User: ${user.username}`))
    .on('react', (user, emoji) =>
      console.log(`Reacted! User: ${user.username} | Emoji: ${emoji.name} (${emoji.id})`))
    .on('pageUpdate', () => Embeds.currentEmbed.title = Embeds.pageIndicator)
    .on('expire', () => console.warn('Expired!'))
    .on('error', console.error);

  await Embeds.build();

  return Embeds
}
