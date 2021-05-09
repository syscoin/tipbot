# tipbot

Before running this bot for the first time please ensure that you create a new
12 word Syscoin mnemonic in config.json and create a safe, secure backup of it somewhere,
delete the receiveIndex/auctionIndex/tradeIndex files in the ls folder (if there) and have a new MongoDB database 
running in the background (once MongoDB is installed it can normally be done with 'sudo service mongod start').
The "config.json.example" file must also be renamed to "config.json" and configured to the Discord server you are running.
