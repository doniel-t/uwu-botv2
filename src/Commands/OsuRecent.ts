import DiscordJS, { MessageEmbed } from 'discord.js';
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
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.STRING,
        },
    ];
    async reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): Promise<void> {
        await interaction.reply({ embeds: [new MessageEmbed().setTitle("Loading...")] });
        getRecentScore(interaction, (embed: MessageEmbed) => {
            interaction.editReply({ embeds: [embed] });
        });
    }
}

export function getInstance() { return new OsuRecent() };

function getRecentScore(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>, callback: (messageEmbed: MessageEmbed) => void) {

    let name = getName(interaction);

    if (!name) {
        callback(new MessageEmbed().setTitle('Please provide a username').setColor('#ff0000'));
        return;
    }

    let ws = new WebSocket('ws://127.0.0.1:60001', { handshakeTimeout: 5000 }); //Connection to Server

    ws.onopen = () => { //Request
        ws.send('osuAPI recent ' + name);
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

        if (result.length == 0) {
            callback(new MessageEmbed().setTitle('No recent score found').setColor('#ff0000'));
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

        let emb = new MessageEmbed()
            .setTitle(recentScore.beatmapset.artist + ' - ' + recentScore.beatmapset.title)
            .setURL(recentScore.beatmap.url)
            .setColor('#0099ff')
            .setFooter({ text: recentScore.created_at })
            .addField('Score', recentScore.score.toString(), true)
            .addField('Combo', recentScore.max_combo.toString(), true)
            .addField('BPM', recentScore.beatmap.bpm.toString(), true)
            .addField('Status', recentScore.beatmap.status, true)
            .addField('Passed%', percentagePassed.toFixed(2).concat("%"), true)
        if (recentScore.mods.length > 0) {
            emb.addField('Mods', recentScore.mods.reduce((name: string) => name + " "), true);
        } else {
            emb.addField('\u200b', '\u200b', true);
        }

        emb.addField('Difficulty', recentScore.beatmap.version, true)
            .addField('StarRating', parseFloat(recentScore.beatmap.difficulty_rating.toString()).toFixed(2), true)
        emb.addField('\u200b', '\u200b', true);


        emb.addField('Accuracy', Acc + '%', true)
            .addField('Hits', recentScore.statistics.count_300.toString().concat(getEmoji('hit300') + " ")
                .concat(recentScore.statistics.count_100).concat(getEmoji('hit100') + " ")
                .concat(recentScore.statistics.count_50).concat(getEmoji('hit50') + " ")
                .concat(recentScore.statistics.count_miss).concat(getEmoji('hit0')), true)

            .setImage('https://assets.ppy.sh/beatmaps/' + recentScore.beatmapset.id + '/covers/cover.jpg');
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

function getEmoji(emojiName: String) {
    let emoji = client.emojis.cache.find(emoji => emoji.name === emojiName);   //get Emoji from Server
    return emoji ? emoji.toString() : emojiName; //Build emojiString
}