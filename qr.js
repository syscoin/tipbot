var exports = module.exports = {};

const qr = require('qrcode')
const fs = require('fs-extra')
const sharp = require('sharp')

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

async function addLogo(pathToFile, pathToLogoQR) {
  var image = await sharp(pathToFile)
    .composite([{ input: './qr/syscoin.png', blend: 'atop'}])
  await image.toFile(pathToLogoQR)
  fs.remove(pathToFile)
  return pathToLogoQR
}

exports.getQR = async function(userID) {
  var profile = await db.getProfile(userID)

  var pathToFile = `./qr/${userID}qr.png`
  var pathToLogoQR = `./qr/${userID}.png`
  var pathExists = await fs.pathExists(pathToFile)

  var qrFile
  try {
    qrFile = await qr.toFile(pathToFile, profile.address, {
      color: {
        dark: "#000000",
        light: "#ffffff"
      }
    })
  } catch (error) {
    console.log(error)
    return null
  }

  return addLogo(pathToFile, pathToLogoQR)
}
