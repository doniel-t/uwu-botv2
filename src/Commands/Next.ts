import DiscordJS from 'discord.js';
import { musicHandler } from '../index';
import { NormalCommandClass } from '../utils/NormalCommand/NormalCommand';

class Next extends NormalCommandClass {
    name = "next";
    description = "Plays next song in music queue";
    async reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): Promise<void> {
        if (!interaction.guildId) {
            interaction.reply({
                content: "Please join a VoiceChannel"
            });
            return;
        }
        await interaction.deferReply();
        if (await musicHandler.skip(interaction.guildId)) {
            interaction.editReply({ content: "Next Song Playing" });
        } else {
            interaction.editReply({ content: "No more songs in queue" });
        }
    }
}

export function getInstance() { return new Next() };