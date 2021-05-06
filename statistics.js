function Bot(client) {
    this.readyAt = "Ready at: " + client.readyAt;
    this.status = "Status: " + client.status + " (active)";
    this.guildList = function() {
        var guilds = client.guilds.array();
        return "Guilds: " + guilds.length;
    }
    this.ping = "Ping: " + client.ping + "ms";
    this.uptime = "Uptime: " + client.uptime + "ms";
    this.isBotObject = true;
}

function viewStats(Obj) {
    if (Obj.isBotObject) {
        return `${Obj.readyAt}\n${Obj.status}\n${Obj.guildList()}\n${Obj.ping}\n${Obj.uptime}`;
    }
    else {
        return null;
    }
}

module.exports = {
    Bot: Bot,
    view: viewStats
}
