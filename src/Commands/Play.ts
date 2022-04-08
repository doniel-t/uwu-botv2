import { joinVoiceChannel } from '@discordjs/voice';
import DiscordJS from 'discord.js';
import ytdl from 'ytdl-core';
import ytpl from 'ytpl';
import { musicHandler } from '../index';
import { NormalCommandClass } from '../utils/Commands/NormalCommand/NormalCommand';

class Play extends NormalCommandClass {
    name = "play";
    shortcut = "p";
    description = "Plays a song or playlist from youtube";
    options = [
        {
            name: "link",
            description: "Link",
            required: true,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.STRING,
        },
        {
            name: "random",
            description: "If true, the added playlist will be shuffled",
            required: false,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.STRING,
        },
    ];
    async reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): Promise<void> {
        await interaction.deferReply();
        if (!interaction.member || !interaction.guildId) {
            interaction.editReply({
                content: "Can't play music in DMs"
            });
            return;
        }
        //@ts-ignore
        if (!interaction.member.voice.channelId) {
            interaction.editReply({
                content: "Please join a VoiceChannel"
            });
            return;
        }

        let link = interaction.options.getString("link", true);
        let validResource = false;

        if (ytdl.validateURL(link)) {
            if (!await musicHandler.addYoutubeToQueue(interaction.guildId, link)) {
                interaction.editReply({ content: "Failed to add YouTube song" });
                return;
            }
            validResource = true;
        }
        if (ytpl.validateID(link)) {
            if (!await musicHandler.addYoutubePlaylistToQueue(interaction.guildId, link, interaction.options.getBoolean("random", false) ?? false)) {
                interaction.editReply({ content: "Failed to add YouTube playlist" });
                return;
            }
            validResource = true;
        }
        //Add other resources here like ytpl or soundcloud

        if (!validResource) {
            interaction.editReply({ content: "Not a supported Link" });
            return;
        }

        let connection = joinVoiceChannel({
            //@ts-ignore
            channelId: interaction.member.voice.channelId,
            guildId: interaction.guildId,
            //@ts-ignore
            adapterCreator: interaction.member.voice.channel.guild.voiceAdapterCreator
        });
        let player = musicHandler.getPlayer(interaction.guildId);
        if (musicHandler.getQueueLength(interaction.guildId) == 0) {
            interaction.editReply({ content: `Start playing ${interaction.options.getString("link", true)}` });
        } else {
            interaction.editReply({ content: `Added ${interaction.options.getString("link")} to queue` });
        }
        connection.subscribe(player);
        musicHandler.PlayEnd(interaction.guildId).on(() => {
            connection.disconnect();
        });
    }
}

export function getInstance() { return new Play() };