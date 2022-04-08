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
        let recentScore = result[0];

        let ObjectCount = Number.parseInt(recentScore._beatmap.objects.normal) +
            Number.parseInt(recentScore._beatmap.objects.slider) +
            Number.parseInt(recentScore._beatmap.objects.spinner);

        let ScoreCount = Number.parseInt(recentScore.counts["50"]) +
            Number.parseInt(recentScore.counts["100"]) +
            Number.parseInt(recentScore.counts["300"]) +
            Number.parseInt(recentScore.counts["miss"]);

        let Acc = (parseFloat(result[2]) * 100).toFixed(2);
        let percentagePassed = (ScoreCount / ObjectCount) * 100;
        if (percentagePassed == 100 && ScoreCount !== ObjectCount) percentagePassed = 99.99;
        let parsedMods = result[1];

        let emb = new MessageEmbed()
            .setTitle(recentScore._beatmap.artist + ' - ' + recentScore._beatmap.title)
            .setURL('https://osu.ppy.sh/beatmapsets/' + recentScore._beatmap.beatmapSetId + '#osu/' + recentScore._beatmap.id)
            .setColor('#0099ff')
            .setFooter({ text: recentScore.raw_date })
            .addField('Score', recentScore.score, true)
            .addField('Combo', recentScore.maxCombo, true)
            .addField('BPM', recentScore._beatmap.bpm, true)
            .addField('Status', recentScore._beatmap.approvalStatus, true)
            .addField('Passed', percentagePassed.toFixed(2).concat("%"), true)

        if (!(parsedMods === "" || parsedMods == null)) {
            emb.addField('Mods', parsedMods, true);
        } else {
            emb.addField('\u200b', '\u200b', true);
        }

        emb.addField('Difficulty', recentScore._beatmap.version, true)
            .addField('StarRating', parseFloat(recentScore._beatmap.difficulty.rating).toFixed(2), true)
        emb.addField('\u200b', '\u200b', true);


        emb.addField('Accuracy', Acc + '%', true)
            .addField('Hits', recentScore.counts["300"].concat(getEmoji('hit300') + " ")
                .concat(recentScore.counts["100"]).concat(getEmoji('hit100') + " ")
                .concat(recentScore.counts["50"]).concat(getEmoji('hit50') + " ")
                .concat(recentScore.counts["miss"]).concat(getEmoji('hit0') + " "), true)

            .setImage('https://assets.ppy.sh/beatmaps/' + recentScore._beatmap.beatmapSetId + '/covers/cover.jpg');
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