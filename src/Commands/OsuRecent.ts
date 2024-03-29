import DiscordJS, { EmbedBuilder, ApplicationCommandOptionType } from 'discord.js';
import { NormalCommandClass } from '../utils/Commands/NormalCommand/NormalCommand';
import { client, nameHandler } from '../index';
import { WebSocket, MessageEvent } from 'ws';
import { GameTypes } from '../utils/NameHandler';

class OsuRecent extends NormalCommandClass {
    name = "osurecent";
    description = "Prints the recent osu! score of a user";
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
        getRecentScore(interaction, (embed: EmbedBuilder) => {
            interaction.editReply({ embeds: [embed] });
        });
    }
}

export function getInstance() { return new OsuRecent() };

function getRecentScore(interaction: DiscordJS.CommandInteraction, callback: (messageEmbed: EmbedBuilder) => void) {

    let name = getName(interaction);

    if (!name) {
        callback(new EmbedBuilder().setTitle('Please provide a username').setColor('#ff0000'));
        return;
    }

    let ws = new WebSocket('ws://127.0.0.1:60001', { handshakeTimeout: 5000 }); //Connection to Server

    ws.onopen = () => { //Request
        ws.send('osuAPI recent ' + name);
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

        if (result.length == 0) {
            callback(new EmbedBuilder().setTitle('No recent score found').setColor('#ff0000'));
            return;
        }

        let recentScore = result[0];

        let ObjectCount = Number.parseInt(recentScore.beatmap.count_circles) +
            Number.parseInt(recentScore.beatmap.count_sliders) +
            Number.parseInt(recentScore.beatmap.count_spinners);

        let ScoreCount = Number.parseInt(recentScore.statistics.count_50) +
            Number.parseInt(recentScore.statistics.count_100) +
            Number.parseInt(recentScore.statistics.count_300) +
            Number.parseInt(recentScore.statistics.count_miss);

        let Acc = (parseFloat(recentScore.accuracy) * 100).toFixed(2);
        let percentagePassed = (ScoreCount / ObjectCount) * 100;
        if (percentagePassed == 100 && ScoreCount !== ObjectCount) percentagePassed = 99.99;

        let emb = new EmbedBuilder()
            .setTitle(recentScore.beatmapset.artist + ' - ' + recentScore.beatmapset.title)
            .setURL(recentScore.beatmap.url)
            .setColor('#0099ff')
            .setFooter({ text: recentScore.created_at })
            .addFields([
                { name: 'Score', value: recentScore.score.toString(), inline: true },
                { name: 'Combo', value: recentScore.max_combo.toString(), inline: true },
                { name: 'BPM', value: recentScore.beatmap.bpm.toString(), inline: true },
                { name: 'Status', value: recentScore.beatmap.status, inline: true },
                { name: 'Passed%', value: percentagePassed.toFixed(2).concat("%"), inline: true },
            ]);
        if (recentScore.mods.length > 0) {
            emb.addFields({ name: 'Mods', value: recentScore.mods.reduce((name: string) => name + " "), inline: true });
        } else {
            emb.addFields({ name: '\u200b', value: '\u200b', inline: true });
        }

        emb.addFields([
            { name: 'Difficulty', value: recentScore.beatmap.version, inline: true },
            { name: 'StarRating', value: parseFloat(recentScore.beatmap.difficulty_rating.toString()).toFixed(2), inline: true },
            { name: '\u200b', value: '\u200b', inline: true },
            { name: 'Accuracy', value: Acc + '%', inline: true },
            {
                name: 'Hits', value: recentScore.statistics.count_300.toString().concat(getEmoji('hit300') + " ")
                    .concat(recentScore.statistics.count_100).concat(getEmoji('hit100') + " ")
                    .concat(recentScore.statistics.count_50).concat(getEmoji('hit50') + " ")
                    .concat(recentScore.statistics.count_miss).concat(getEmoji('hit0')), inline: true
            }
        ]);

        emb.setImage('https://assets.ppy.sh/beatmaps/' + recentScore.beatmapset.id + '/covers/cover.jpg');
        ws.close();

        callback(emb);
    };
}

function getName(interaction: DiscordJS.CommandInteraction) {
    let name = interaction.options.get("username")?.value;
    if (name == null) {
        //@ts-ignore 2322
        name = nameHandler.get(interaction.user.id, interaction.guildId, GameTypes.OSU);
    }
    return name;
}

function getEmoji(emojiName: String) {
    let emoji = client.emojis.cache.find(emoji => emoji.name === emojiName);   //get Emoji from Server
    return emoji ? emoji.toString() : emojiName; //Build emojiString
}