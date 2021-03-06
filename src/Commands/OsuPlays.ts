import DiscordJS, { MessageEmbed } from 'discord.js';
import { NormalCommandClass } from '../utils/Commands/NormalCommand/NormalCommand';
import { nameHandler } from '../index';
import { WebSocket, MessageEvent } from 'ws';
import { GameTypes } from '../utils/NameHandler';

class OsuPlays extends NormalCommandClass {
    name = "osuplays";
    description = "Prints the best osu! score of a user";
    options = [
        {
            name: "username",
            description: "Username of the user",
            required: false,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.STRING,
        },
    ];
    async reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): Promise<void> {
        await interaction.reply({ embeds: [new MessageEmbed().setTitle("Loading...")] });
        getBestScores(interaction, (embed: MessageEmbed) => {
            interaction.editReply({ embeds: [embed] });
        });
    }
}

export function getInstance() { return new OsuPlays() };

const MAX_PLAYS = 5;

function getBestScores(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>, callback: (messageEmbed: MessageEmbed) => void) {

    let name = getName(interaction);

    if (!name) {
        callback(new MessageEmbed().setTitle('Please provide a username').setColor('#ff0000'));
        return;
    }

    let ws = new WebSocket('ws://127.0.0.1:60001', { handshakeTimeout: 5000 }); //Connection to Server

    ws.onopen = () => { //Request
        ws.send('osuAPI plays ' + name);
    };

    ws.onerror = function error() {
        callback(new MessageEmbed().setTitle('Websocket-Server is unreachable').setColor('#ff0000'));
    };

    ws.onmessage = function incoming(event: MessageEvent) { //Answer

        let data = event.data.toString();

        if (data.startsWith('ERROR')) {
            callback(new MessageEmbed().setTitle(data).setColor('#ff0000'));
            return;
        }

        let result = JSON.parse(data);

        let emb = new MessageEmbed()
            .setTitle(name + '`s Top ' + MAX_PLAYS + ' Plays');

        for (let index = 0; index < MAX_PLAYS; index++) {
            let Link = `[${result[index].beatmapset.title}](${result[index].beatmap.url})`;
            let content = Link.concat(`\nDiff: ${result[index].beatmap.version}`).concat("\nAcc: ").concat((parseFloat(result[index].accuracy) * 100).toFixed(2)).concat(" %\nPP: ").concat(result[index].pp);

            if (result[index].mods.length > 0) {
                content = content.concat(`\nMods: ${result[index].mods.reduce((name: string) => name + " ")}`);
            }

            emb.addField('#' + (index + 1), content);
        }

        ws.close();
        callback(emb);
    };
}

function getName(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>) {
    let name = interaction.options.getString("username");
    if (name == null) {
        //@ts-ignore 2322
        name = nameHandler.get(interaction.user.id, interaction.guildId, GameTypes.OSU);
    }
    return name;
}