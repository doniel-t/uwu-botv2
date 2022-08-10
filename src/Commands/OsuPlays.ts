import DiscordJS, { EmbedBuilder, ApplicationCommandOptionType } from 'discord.js';
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
            type: ApplicationCommandOptionType.String,
        },
    ];
    async reply(interaction: DiscordJS.CommandInteraction): Promise<void> {
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle("Loading...")] });
        getBestScores(interaction, (embed: EmbedBuilder) => {
            interaction.editReply({ embeds: [embed] });
        });
    }
}

export function getInstance() { return new OsuPlays() };

const MAX_PLAYS = 5;

function getBestScores(interaction: DiscordJS.CommandInteraction, callback: (messageEmbed: EmbedBuilder) => void) {

    let name = getName(interaction);

    if (!name) {
        callback(new EmbedBuilder().setTitle('Please provide a username').setColor('#ff0000'));
        return;
    }

    let ws = new WebSocket('ws://127.0.0.1:60001', { handshakeTimeout: 5000 }); //Connection to Server

    ws.onopen = () => { //Request
        ws.send('osuAPI plays ' + name);
    };

    ws.onerror = function error() {
        callback(new EmbedBuilder().setTitle('Websocket-Server is unreachable').setColor('#ff0000'));
    };

    ws.onmessage = function incoming(event: MessageEvent) { //Answer

        let data = event.data.toString();

        if (data.startsWith('ERROR')) {
            callback(new EmbedBuilder().setTitle(data).setColor('#ff0000'));
            return;
        }

        let result = JSON.parse(data);

        let emb = new EmbedBuilder()
            .setTitle(name + '`s Top ' + MAX_PLAYS + ' Plays');

        for (let index = 0; index < MAX_PLAYS; index++) {
            let Link = `[${result[index].beatmapset.title}](${result[index].beatmap.url})`;
            let content = Link.concat(`\nDiff: ${result[index].beatmap.version}`).concat("\nAcc: ").concat((parseFloat(result[index].accuracy) * 100).toFixed(2)).concat(" %\nPP: ").concat(result[index].pp);

            if (result[index].mods.length > 0) {
                content = content.concat(`\nMods: ${result[index].mods.reduce((name: string) => name + " ")}`);
            }

            emb.addFields({ name: '#' + (index + 1), value: content });
        }

        ws.close();
        callback(emb);
    };
}

function getName(interaction: DiscordJS.CommandInteraction) {
    let name = interaction.options.get("username")?.value;
    if (name == null || name == undefined || name == "") {
        //@ts-ignore 2322
        name = nameHandler.get(interaction.user.id, interaction.guildId, GameTypes.OSU);
    }
    return name;
}