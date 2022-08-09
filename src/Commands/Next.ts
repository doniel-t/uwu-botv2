import DiscordJS from 'discord.js';
import { musicHandler } from '../index';
import { NormalCommandClass } from '../utils/Commands/NormalCommand/NormalCommand';

class Next extends NormalCommandClass {
    name = "next";
    description = "Plays next song in music queue";
    async reply(interaction: DiscordJS.CommandInteraction): Promise<void> {
        if (!interaction.guildId) {
            interaction.reply({
                content: "Please join a VoiceChannel"
            });
            return;
        }
        await interaction.deferReply();
        let nextSong = await musicHandler.skip(interaction.guildId);
        if (nextSong !== undefined) {
            interaction.editReply({ content: `Playing ${nextSong}` });
        } else {
            interaction.editReply({ content: "No more songs in queue" });
        }
    }
}

export function getInstance() { return new Next() };