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
  try {
    var image = await sharp(pathToFile)
      .composite([{ input: './qr/syscoin.png', blend: 'atop'}])
    await image.toFile(pathToLogoQR)
    fs.remove(pathToFile)
    return pathToLogoQR
  } catch (error) {
    console.log("Error adding logo to QR")
    console.log(error)
    return null
  }
}

exports.getQR = async function(userID) {
  try {
    var profile = await db.getProfile(userID)
  } catch (error) {
    console.log(error)
    return
  }

  var pathToFile = `./qr/${userID}qr.png`
  var pathToLogoQR = `./qr/${userID}.png`

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
