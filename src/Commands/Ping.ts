import DiscordJS from 'discord.js';
import { NormalCommandClass } from '../utils/CommandInterface';
import ping from 'ping';

class Ping extends NormalCommandClass {
    name = "ping";
    description = "Pings different Servers";
    servers = ['status.discordapp.com', 'google.com'];
    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): void {
        let answer = '';
        let nRecieved = 0;
        let nAnswers = this.servers.length;
        this.servers.forEach(function (server) {
            ping.promise.probe(server).then(function (res: any) {
                answer += res.host + ' ' + res.time + 'ms\n';
                nRecieved++;
                if (nRecieved >= nAnswers)
                    interaction.reply({
                        content: answer
                    });
            })
        })
    }
}

export function getInstance() { return new Ping() };