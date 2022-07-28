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

// adds a logo to the middle of the qr code, cuz it looks cool...
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

// returns the qr code with the deposit address in the given user's profile
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

exports.getNevmQR = async function (userId) {
  try {
    const pathToFile = `./qr/${userId}qr-nevm.png`;
    const pathToLogoQR = `./qr/${userId}-nevm.png`;
    const nevmWallet = await db.nevm.getNevmWallet(userId);
    await qr.toFile(pathToFile, nevmWallet.address, {
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    });
    return addLogo(pathToFile, pathToLogoQR);
  } catch (error) {
    console.log(error);
    return null;
  }
};