import { joinVoiceChannel } from '@discordjs/voice';
import DiscordJS, { ApplicationCommandOptionType } from 'discord.js';
import { SoundCloudMusicResource } from '../utils/Music/SoundCloudMusicResource';
import ytdl from 'ytdl-core';
import ytpl from 'ytpl';
import { musicHandler } from '../index';
import { NormalCommandClass } from '../utils/Commands/NormalCommand/NormalCommand';

class Play extends NormalCommandClass {
    name = "play";
    shortcut = "p";
    description = "Plays a song from the link provided, see /musicsupport for more info";
    options = [
        {
            name: "link",
            description: "Link",
            required: true,
            type: ApplicationCommandOptionType.String,
        },
        {
            name: "random",
            description: "If true, the added playlist will be shuffled",
            required: false,
            type: ApplicationCommandOptionType.String,
        },
    ];
    async reply(interaction: DiscordJS.CommandInteraction): Promise<void> {
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

        if (!await this.tryAddToQueue(interaction)) {
            interaction.editReply({ content: "Not a supported Link" });
            return;
        }

        this.createAudioPlayer(interaction);
    }

    private async tryAddToQueue(interaction: DiscordJS.CommandInteraction): Promise<boolean> {
        if (!interaction.guildId) return false;
        let link = interaction.options.get("link", true).value as string;

        if (ytdl.validateURL(link)) {
            if (!await musicHandler.addYoutubeToQueue(interaction.guildId, link)) {
                interaction.editReply({ content: "Failed to add YouTube song" });
                return false;
            }
            return true;
        }
        if (ytpl.validateID(link)) {
            if (!await musicHandler.addYoutubePlaylistToQueue(interaction.guildId, link, interaction.options.get("random", false)?.value as boolean ?? false)) {
                interaction.editReply({ content: "Failed to add YouTube playlist" });
                return false;
            }
            return true;
        }
        if (SoundCloudMusicResource.validateURL(link)) {
            if (!await musicHandler.addSoundCloundToQueue(interaction.guildId, link)) {
                interaction.editReply({ content: "Failed to add Soundcloud song" });
                return false;
            }
            return true;
        }
        return false;
    }

    private createAudioPlayer(interaction: DiscordJS.CommandInteraction): void {
        if (!interaction.guildId) return;
        let connection = joinVoiceChannel({
            //@ts-ignore
            channelId: interaction.member.voice.channelId,
            guildId: interaction.guildId,
            //@ts-ignore
            adapterCreator: interaction.member.voice.channel.guild.voiceAdapterCreator
        });
        let player = musicHandler.getPlayer(interaction.guildId);
        if (musicHandler.getQueueLength(interaction.guildId) == 0) {
            interaction.editReply({ content: `Start playing ${interaction.options.get("link", true).value}` });
        } else {
            interaction.editReply({ content: `Added ${interaction.options.get("link", true).value} to queue` });
        }
        connection.subscribe(player);
        musicHandler.PlayEnd(interaction.guildId).on(() => {
            connection.disconnect();
        });
    }
}

export function getInstance() { return new Play() };