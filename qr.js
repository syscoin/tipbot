var exports = module.exports = {};

const qr = require('qrcode')
const fs = require('fs-extra')

const db = require('./db.js')

async function checkQRDir() {
  try {
    await fs.ensureDir("./qr")
    console.log('qr directory created')
  } catch (err) {
    console.error(err)
  }
}

checkQRDir()

exports.getQR = async function(userID) {
  var profile = await db.getProfile(userID)

  var pathToFile = `./qr/${userID}.png`
  var pathExists = await fs.pathExists(pathToFile)

  if (pathExists) {
    return pathToFile
  } else {
    await qr.toFile(`./qr/${userID}.png`, profile.address, {
      color: {
        dark: "#000A63",
        light: "#ffffff"
      }
    }, function (err) {
      if (err) {
        console.log(err)
        return null
      }
    })

    return pathToFile
  }
}
